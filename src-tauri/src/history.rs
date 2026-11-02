// M9 snapshots: thin plumbing over libgit2. A bare repo at `<root>/.storyworks/history.git`,
// no work tree and no libgit2 status: the caller names the tracked files (`scope`), we hash
// them raw and compare with the newest snapshot. The user's own `.git`/`.gitignore` are never read.
use git2::{
    Delta, DiffOptions, ErrorCode, Index, IndexEntry, IndexTime, ObjectType, Oid, Repository,
    RepositoryInitOptions, Signature, Sort,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Component, Path, PathBuf};

const GIT_DIR: &str = ".storyworks/history.git";

#[derive(Debug, Serialize)]
pub struct HistoryError {
    /// "corrupt" | "nothing-to-commit" | "not-found" | "io"
    pub code: &'static str,
    pub message: String,
}

type Res<T> = Result<T, HistoryError>;

fn err(code: &'static str, message: impl Into<String>) -> HistoryError {
    HistoryError { code, message: message.into() }
}
fn corrupt(e: impl std::fmt::Display) -> HistoryError {
    err("corrupt", format!("The history cannot be read: {e}"))
}
fn io(e: impl std::fmt::Display) -> HistoryError {
    err("io", e.to_string())
}

#[derive(Debug, Serialize, PartialEq)]
pub struct FileChange {
    pub path: String,
    /// "added" | "modified" | "deleted"
    pub status: &'static str,
}

#[derive(Debug, Serialize)]
pub struct SnapshotInfo {
    pub id: String,
    pub message: String,
    /// ISO-8601, UTC
    pub time: String,
}

#[derive(Debug, Deserialize)]
pub struct Override {
    pub path: String,
    pub bytes: Vec<u8>,
}

fn git_dir(root: &Path) -> PathBuf {
    root.join(GIT_DIR)
}

/// Only plain relative paths inside the project.
fn safe(path: &str) -> Res<&Path> {
    let p = Path::new(path);
    let ok = !path.is_empty() && p.components().all(|c| matches!(c, Component::Normal(_)));
    if ok { Ok(p) } else { Err(io(format!("bad path: {path}"))) }
}

/// None when no history exists yet. Any failure to open an existing one is `corrupt`.
fn open(root: &Path) -> Res<Option<Repository>> {
    let dir = git_dir(root);
    if !dir.exists() {
        return Ok(None);
    }
    Repository::open_bare(&dir).map(Some).map_err(corrupt)
}

fn has_objects(repo: &Repository) -> Res<bool> {
    let odb = repo.odb().map_err(corrupt)?;
    let mut found = false;
    let _ = odb.foreach(|_| {
        found = true;
        false
    });
    Ok(found)
}

/// Newest snapshot's commit; None for an empty history. A ref that is gone while objects remain is corrupt.
fn head_commit(repo: &Repository) -> Res<Option<git2::Commit<'_>>> {
    match repo.head() {
        Ok(h) => Ok(Some(h.peel_to_commit().map_err(corrupt)?)),
        Err(e) if e.code() == ErrorCode::UnbornBranch || e.code() == ErrorCode::NotFound => {
            if has_objects(repo)? { Err(corrupt("the newest snapshot is missing")) } else { Ok(None) }
        }
        Err(e) => Err(corrupt(e)),
    }
}

fn blobs(repo: &Repository, tree: &git2::Tree) -> Res<BTreeMap<String, Oid>> {
    let mut out = BTreeMap::new();
    tree.walk(git2::TreeWalkMode::PreOrder, |dir, e| {
        if e.kind() == Some(ObjectType::Blob) {
            if let Some(name) = e.name() {
                out.insert(format!("{dir}{name}"), e.id());
            }
        }
        0
    })
    .map_err(corrupt)?;
    let odb = repo.odb().map_err(corrupt)?;
    if out.values().any(|id| !odb.exists(*id)) {
        return Err(corrupt("a saved file is missing"));
    }
    Ok(out)
}

fn head_files(repo: Option<&Repository>) -> Res<BTreeMap<String, Oid>> {
    let Some(repo) = repo else { return Ok(BTreeMap::new()) };
    match head_commit(repo)? {
        Some(c) => blobs(repo, &c.tree().map_err(corrupt)?),
        None => Ok(BTreeMap::new()),
    }
}

pub fn check(root: &Path) -> Res<()> {
    head_files(open(root)?.as_ref()).map(|_| ())
}

pub fn status(root: &Path, scope: &[String]) -> Res<Vec<FileChange>> {
    let repo = open(root)?;
    let head = head_files(repo.as_ref())?;
    let mut paths: Vec<&str> = scope.iter().map(String::as_str).collect();
    paths.extend(head.keys().map(String::as_str));
    paths.sort();
    paths.dedup();
    let mut out = vec![];
    for path in paths {
        let full = root.join(safe(path)?);
        if full.is_file() {
            let id = Oid::hash_file(ObjectType::Blob, &full).map_err(io)?;
            match head.get(path) {
                None => out.push(FileChange { path: path.into(), status: "added" }),
                Some(old) if *old != id => out.push(FileChange { path: path.into(), status: "modified" }),
                _ => {}
            }
        } else if head.contains_key(path) {
            out.push(FileChange { path: path.into(), status: "deleted" });
        }
    }
    Ok(out)
}

fn entry(path: &str, id: Oid, len: usize) -> IndexEntry {
    IndexEntry {
        ctime: IndexTime::new(0, 0),
        mtime: IndexTime::new(0, 0),
        dev: 0,
        ino: 0,
        mode: 0o100644,
        uid: 0,
        gid: 0,
        file_size: len as u32,
        id,
        flags: 0,
        flags_extended: 0,
        path: path.as_bytes().to_vec(),
    }
}

pub fn commit(root: &Path, message: &str, include: &[String], overrides: &[Override]) -> Res<String> {
    let repo = match open(root)? {
        Some(r) => r,
        None => {
            std::fs::create_dir_all(root.join(".storyworks")).map_err(io)?;
            let mut opts = RepositoryInitOptions::new();
            opts.bare(true).initial_head("main");
            Repository::init_opts(git_dir(root), &opts).map_err(io)?
        }
    };
    let parent = head_commit(&repo)?;
    let parent_tree = parent.as_ref().map(|c| c.tree()).transpose().map_err(corrupt)?;
    let mut idx = Index::new().map_err(io)?;
    if let Some(t) = &parent_tree {
        idx.read_tree(t).map_err(corrupt)?;
    }
    for path in include {
        let rel = safe(path)?;
        let full = root.join(rel);
        if full.is_file() {
            let bytes = std::fs::read(&full).map_err(io)?;
            let id = repo.blob(&bytes).map_err(io)?;
            idx.add(&entry(path, id, bytes.len())).map_err(io)?;
        } else {
            let _ = idx.remove(rel, 0); // absent from the tree already is fine
        }
    }
    for o in overrides {
        safe(&o.path)?;
        let id = repo.blob(&o.bytes).map_err(io)?;
        idx.add(&entry(&o.path, id, o.bytes.len())).map_err(io)?;
    }
    let tree_id = idx.write_tree_to(&repo).map_err(io)?;
    if parent_tree.as_ref().map(|t| t.id()) == Some(tree_id) {
        return Err(err("nothing-to-commit", "Nothing to snapshot."));
    }
    let tree = repo.find_tree(tree_id).map_err(io)?;
    let sig = Signature::now("Storyworks", "storyworks@localhost").map_err(io)?;
    let parents: Vec<&git2::Commit> = parent.iter().collect();
    let id = repo.commit(Some("HEAD"), &sig, &sig, message, &tree, &parents).map_err(io)?;
    Ok(id.to_string())
}

fn iso(seconds: i64) -> String {
    // Days-from-civil inverse (Howard Hinnant).
    let days = seconds.div_euclid(86_400);
    let rem = seconds.rem_euclid(86_400);
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.000Z", rem / 3600, rem % 3600 / 60, rem % 60)
}

pub fn log(root: &Path) -> Res<Vec<SnapshotInfo>> {
    let Some(repo) = open(root)? else { return Ok(vec![]) };
    if head_commit(&repo)?.is_none() {
        return Ok(vec![]);
    }
    let mut walk = repo.revwalk().map_err(corrupt)?;
    walk.set_sorting(Sort::TOPOLOGICAL).map_err(corrupt)?;
    walk.push_head().map_err(corrupt)?;
    let mut out = vec![];
    for id in walk {
        let c = repo.find_commit(id.map_err(corrupt)?).map_err(corrupt)?;
        out.push(SnapshotInfo {
            id: c.id().to_string(),
            message: c.message().unwrap_or("").trim_end().to_string(),
            time: iso(c.time().seconds()),
        });
    }
    Ok(out)
}

fn find_commit<'r>(repo: &'r Repository, id: &str) -> Res<git2::Commit<'r>> {
    let unknown = || err("not-found", format!("Unknown snapshot {id}"));
    let oid = Oid::from_str(id).map_err(|_| unknown())?;
    repo.find_commit(oid).map_err(|_| {
        // A lookup failing because the history itself is damaged is corrupt, not "unknown".
        head_commit(repo).err().unwrap_or_else(unknown)
    })
}

fn need(root: &Path) -> Res<Repository> {
    open(root)?.ok_or_else(|| err("not-found", "There is no history yet."))
}

pub fn changed_files(root: &Path, id: &str) -> Res<Vec<FileChange>> {
    let repo = need(root)?;
    let c = find_commit(&repo, id)?;
    let tree = c.tree().map_err(corrupt)?;
    let parent_tree = if c.parent_count() > 0 { Some(c.parent(0).map_err(corrupt)?.tree().map_err(corrupt)?) } else { None };
    let diff = repo
        .diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut DiffOptions::new()))
        .map_err(corrupt)?;
    let mut out = vec![];
    for d in diff.deltas() {
        let (status, file) = match d.status() {
            Delta::Added => ("added", d.new_file()),
            Delta::Deleted => ("deleted", d.old_file()),
            Delta::Modified => ("modified", d.new_file()),
            _ => continue,
        };
        if let Some(p) = file.path() {
            out.push(FileChange { path: p.to_string_lossy().replace('\\', "/"), status });
        }
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

pub fn tree(root: &Path, id: &str) -> Res<Vec<String>> {
    let repo = need(root)?;
    let t = find_commit(&repo, id)?.tree().map_err(corrupt)?;
    Ok(blobs(&repo, &t)?.into_keys().collect())
}

/// `not-found` error when the file is not in that snapshot.
pub fn read(root: &Path, id: &str, path: &str) -> Res<Vec<u8>> {
    let repo = need(root)?;
    let t = find_commit(&repo, id)?.tree().map_err(corrupt)?;
    let e = t.get_path(safe(path)?).map_err(|_| err("not-found", format!("{path} is not in this snapshot")))?;
    let blob = repo.find_blob(e.id()).map_err(corrupt)?;
    Ok(blob.content().to_vec())
}

// Commands: thin wrappers, run off the main thread.
#[tauri::command(async)]
pub fn history_check(root: String) -> Res<()> {
    check(Path::new(&root))
}
#[tauri::command(async)]
pub fn history_status(root: String, scope: Vec<String>) -> Res<Vec<FileChange>> {
    status(Path::new(&root), &scope)
}
#[tauri::command(async)]
pub fn history_commit(root: String, message: String, include: Vec<String>, overrides: Vec<Override>) -> Res<String> {
    commit(Path::new(&root), &message, &include, &overrides)
}
#[tauri::command(async)]
pub fn history_log(root: String) -> Res<Vec<SnapshotInfo>> {
    log(Path::new(&root))
}
#[tauri::command(async)]
pub fn history_changed_files(root: String, id: String) -> Res<Vec<FileChange>> {
    changed_files(Path::new(&root), &id)
}
#[tauri::command(async)]
pub fn history_tree(root: String, id: String) -> Res<Vec<String>> {
    tree(Path::new(&root), &id)
}
/// Raw bytes (no JSON number array); a missing file is a `not-found` error.
#[tauri::command(async)]
pub fn history_read(root: String, id: String, path: String) -> Res<tauri::ipc::Response> {
    read(Path::new(&root), &id, &path).map(tauri::ipc::Response::new)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::{AtomicUsize, Ordering};

    struct Tmp(PathBuf);
    impl Tmp {
        fn new() -> Tmp {
            static N: AtomicUsize = AtomicUsize::new(0);
            let p = std::env::temp_dir().join(format!("sw-history-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)));
            let _ = fs::remove_dir_all(&p);
            fs::create_dir_all(&p).unwrap();
            Tmp(p)
        }
        fn write(&self, rel: &str, text: &str) {
            let f = self.0.join(rel);
            fs::create_dir_all(f.parent().unwrap()).unwrap();
            fs::write(f, text).unwrap();
        }
    }
    impl Drop for Tmp {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn s(v: &[&str]) -> Vec<String> {
        v.iter().map(|x| x.to_string()).collect()
    }
    fn ch(path: &str, status: &'static str) -> FileChange {
        FileChange { path: path.into(), status }
    }
    const ALL: [&str; 4] = ["project.json", "scenes/a.json", "scenes/b.json", "scenes/c.json"];
    fn project() -> Tmp {
        let t = Tmp::new();
        for (f, x) in [("project.json", "{}"), ("scenes/a.json", "a1"), ("scenes/b.json", "b1"), ("scenes/c.json", "c1")] {
            t.write(f, x);
        }
        t
    }
    fn first(t: &Tmp) -> String {
        commit(&t.0, "first", &s(&ALL), &[]).unwrap()
    }

    #[test]
    fn nothing_exists_until_the_first_commit() {
        let t = project();
        assert!(!git_dir(&t.0).exists());
        assert!(log(&t.0).unwrap().is_empty());
        check(&t.0).unwrap();
        let st = status(&t.0, &s(&ALL)).unwrap();
        assert_eq!(st.len(), 4);
        assert!(st.iter().all(|c| c.status == "added"));
        assert!(!git_dir(&t.0).exists());
    }

    #[test]
    fn first_commit_creates_history_and_logs_it() {
        let t = project();
        let id = first(&t);
        assert!(git_dir(&t.0).is_dir());
        let l = log(&t.0).unwrap();
        assert_eq!((l.len(), l[0].id.as_str(), l[0].message.as_str()), (1, id.as_str(), "first"));
        assert!(l[0].time.starts_with("20") && l[0].time.ends_with(".000Z"));
        assert!(status(&t.0, &s(&ALL)).unwrap().is_empty());
    }

    #[test]
    fn partial_commit_leaves_the_others_modified() {
        let t = project();
        first(&t);
        for (f, x) in [("scenes/a.json", "a2"), ("scenes/b.json", "b2"), ("scenes/c.json", "c2")] {
            t.write(f, x);
        }
        let id = commit(&t.0, "partial", &s(&["scenes/a.json", "scenes/b.json"]), &[]).unwrap();
        let st = status(&t.0, &s(&ALL)).unwrap();
        assert_eq!(st, vec![ch("scenes/c.json", "modified")]);
        assert_eq!(read(&t.0, &id, "scenes/a.json").unwrap(), b"a2");
        assert_eq!(read(&t.0, &id, "scenes/c.json").unwrap(), b"c1");
    }

    #[test]
    fn overrides_win_over_the_folder_and_missing_included_files_are_deleted() {
        let t = project();
        first(&t);
        fs::remove_file(t.0.join("scenes/c.json")).unwrap();
        let o = Override { path: "project.json".into(), bytes: b"{\"merged\":1}".to_vec() };
        let id = commit(&t.0, "x", &s(&["scenes/c.json"]), &[o]).unwrap();
        assert_eq!(read(&t.0, &id, "project.json").unwrap(), b"{\"merged\":1}");
        assert_eq!(tree(&t.0, &id).unwrap(), s(&["project.json", "scenes/a.json", "scenes/b.json"]));
        // folder's project.json ("{}") differs from the recorded override
        assert_eq!(status(&t.0, &s(&ALL)).unwrap(), vec![ch("project.json", "modified")]);
    }

    #[test]
    fn status_covers_scope_and_everything_in_the_last_snapshot() {
        let t = project();
        first(&t);
        fs::remove_file(t.0.join("scenes/a.json")).unwrap();
        t.write("scenes/new.json", "n");
        t.write("README.md", "user file");
        let st = status(&t.0, &s(&["scenes/new.json"])).unwrap();
        assert_eq!(st, vec![ch("scenes/a.json", "deleted"), ch("scenes/new.json", "added")]);
    }

    #[test]
    fn changed_files_compare_with_the_parent_and_first_is_all_added() {
        let t = project();
        let a = first(&t);
        assert_eq!(changed_files(&t.0, &a).unwrap().len(), 4);
        assert!(changed_files(&t.0, &a).unwrap().iter().all(|c| c.status == "added"));
        t.write("scenes/a.json", "a2");
        fs::remove_file(t.0.join("scenes/b.json")).unwrap();
        t.write("scenes/d.json", "d");
        let b = commit(&t.0, "b", &s(&["scenes/a.json", "scenes/b.json", "scenes/d.json"]), &[]).unwrap();
        assert_eq!(
            changed_files(&t.0, &b).unwrap(),
            vec![ch("scenes/a.json", "modified"), ch("scenes/b.json", "deleted"), ch("scenes/d.json", "added")]
        );
        assert_eq!(log(&t.0).unwrap().iter().map(|x| x.id.clone()).collect::<Vec<_>>(), vec![b, a]);
    }

    #[test]
    fn tree_lists_files_and_read_reports_missing_ones() {
        let t = project();
        let id = first(&t);
        assert_eq!(tree(&t.0, &id).unwrap(), s(&ALL));
        assert_eq!(read(&t.0, &id, "nope.json").unwrap_err().code, "not-found");
        assert_eq!(read(&t.0, "0".repeat(40).as_str(), "project.json").unwrap_err().code, "not-found");
    }

    #[test]
    fn identical_tree_is_nothing_to_commit() {
        let t = project();
        first(&t);
        assert_eq!(commit(&t.0, "again", &s(&ALL), &[]).unwrap_err().code, "nothing-to-commit");
        assert_eq!(log(&t.0).unwrap().len(), 1);
    }

    #[test]
    fn paths_outside_the_project_are_refused() {
        let t = project();
        assert_eq!(commit(&t.0, "x", &s(&["../evil"]), &[]).unwrap_err().code, "io");
        assert_eq!(status(&t.0, &s(&["/etc/passwd"])).unwrap_err().code, "io");
    }

    fn snapshot_of(dir: &Path) -> BTreeMap<String, Vec<u8>> {
        fn walk(root: &Path, dir: &Path, out: &mut BTreeMap<String, Vec<u8>>) {
            for e in fs::read_dir(dir).unwrap() {
                let p = e.unwrap().path();
                if p.is_dir() { walk(root, &p, out) } else {
                    out.insert(p.strip_prefix(root).unwrap().to_string_lossy().into(), fs::read(&p).unwrap());
                }
            }
        }
        let mut out = BTreeMap::new();
        walk(dir, dir, &mut out);
        out
    }

    #[test]
    fn the_users_own_git_repo_and_gitignore_are_untouched() {
        let t = project();
        Repository::init(&t.0).unwrap();
        t.write(".gitignore", "*\n");
        let before = snapshot_of(&t.0.join(".git"));
        first(&t); // tracked even though the user's .gitignore ignores everything
        t.write("scenes/a.json", "a2");
        commit(&t.0, "second", &s(&["scenes/a.json"]), &[]).unwrap();
        status(&t.0, &s(&ALL)).unwrap();
        assert_eq!(before, snapshot_of(&t.0.join(".git")));
        assert_eq!(fs::read_to_string(t.0.join(".gitignore")).unwrap(), "*\n");
        assert!(Repository::open(&t.0).unwrap().head().is_err());
        assert!(!tree(&t.0, &log(&t.0).unwrap()[0].id).unwrap().contains(&".gitignore".to_string()));
    }

    #[test]
    fn an_unborn_history_is_empty_not_corrupt() {
        let t = project();
        fs::create_dir_all(t.0.join(".storyworks")).unwrap();
        Repository::init_bare(git_dir(&t.0)).unwrap();
        check(&t.0).unwrap();
        assert!(log(&t.0).unwrap().is_empty());
        assert_eq!(status(&t.0, &s(&ALL)).unwrap().len(), 4);
        first(&t); // and it can take its first snapshot
        assert_eq!(log(&t.0).unwrap().len(), 1);
    }

    #[test]
    fn garbage_head_is_corrupt() {
        let t = project();
        first(&t);
        fs::write(git_dir(&t.0).join("HEAD"), "garbage").unwrap();
        assert_eq!(check(&t.0).unwrap_err().code, "corrupt");
        assert_eq!(status(&t.0, &s(&ALL)).unwrap_err().code, "corrupt");
        assert_eq!(commit(&t.0, "x", &s(&ALL), &[]).unwrap_err().code, "corrupt");
    }

    #[test]
    fn not_a_repository_is_corrupt() {
        let t = project();
        first(&t);
        fs::remove_file(git_dir(&t.0).join("HEAD")).unwrap();
        assert_eq!(check(&t.0).unwrap_err().code, "corrupt");
        assert_eq!(log(&t.0).unwrap_err().code, "corrupt");
    }

    #[test]
    fn lost_branch_with_objects_left_is_corrupt() {
        let t = project();
        first(&t);
        fs::remove_file(git_dir(&t.0).join("refs/heads/main")).unwrap();
        assert_eq!(check(&t.0).unwrap_err().code, "corrupt");
    }

    #[test]
    fn missing_saved_files_are_corrupt() {
        let t = project();
        let id = first(&t);
        let objects = git_dir(&t.0).join("objects");
        for e in fs::read_dir(&objects).unwrap() {
            let p = e.unwrap().path();
            if p.file_name().unwrap().len() == 2 {
                fs::remove_dir_all(p).unwrap();
            }
        }
        assert_eq!(check(&t.0).unwrap_err().code, "corrupt");
        assert_eq!(tree(&t.0, &id).unwrap_err().code, "corrupt");
    }

    #[test]
    fn iso_formats_known_instants() {
        assert_eq!(iso(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(iso(1_794_000_000), "2026-11-06T21:20:00.000Z");
        assert_eq!(iso(951_782_400 + 86_399), "2000-02-29T23:59:59.000Z");
    }
}

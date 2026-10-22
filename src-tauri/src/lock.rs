use sysinfo::{Pid, ProcessesToUpdate, System};

#[tauri::command]
pub fn machine_name() -> String {
    System::host_name().unwrap_or_default()
}

#[tauri::command]
pub fn process_id() -> u32 {
    std::process::id()
}

#[tauri::command]
pub fn process_alive(pid: u32) -> bool {
    let pid = Pid::from_u32(pid);
    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::Some(&[pid]), true);
    sys.process(pid).is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn own_pid_is_alive() {
        assert!(process_alive(std::process::id()));
    }

    #[test]
    fn process_id_is_own_pid() {
        assert_eq!(process_id(), std::process::id());
    }

    #[test]
    fn absurd_pid_is_not_alive() {
        assert!(!process_alive(u32::MAX - 1));
    }
}

import { invoke } from '@tauri-apps/api/core'
import type { LockEnv } from './types'

/** Real environment for the project lock; machine name and pid come from Rust. */
export async function createTauriLockEnv(): Promise<LockEnv> {
  const [machine, pid] = await Promise.all([
    invoke<string>('machine_name'),
    invoke<number>('process_id'),
  ])
  return {
    now: () => Date.now(),
    machine: () => machine,
    pid: () => pid,
    processAlive: (p) => invoke<boolean>('process_alive', { pid: p }),
  }
}

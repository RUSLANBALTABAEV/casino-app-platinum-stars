/* eslint-disable no-console */

// Preload guard for Node.js runtime (use via NODE_OPTIONS=--require /path/to/exec-guard.cjs)
// Blocks common RCE payloads that attempt to download/execute shell scripts.

function looksLikeRcePayload(command) {
  const c = String(command || '').toLowerCase();
  return (
    c.includes('wget ') ||
    c.includes('curl ') ||
    c.includes('|sh') ||
    c.includes('bash -c') ||
    c.includes('mkfifo') ||
    c.includes(' nc ') ||
    c.includes('base64 -d') ||
    c.includes('/bin/sh -i') ||
    c.includes('python -c') ||
    c.includes('perl -e')
  );
}

function looksLikeRceArgs(file, args) {
  const cmd = [file, ...(Array.isArray(args) ? args : [])].join(' ');
  return looksLikeRcePayload(cmd);
}

try {
  const specs = ['child_process', 'node:child_process'];
  const modules = [];
  for (const spec of specs) {
    try {
      modules.push(require(spec));
    } catch {
      // ignore
    }
  }

  for (const cp of modules) {
    const origExec = cp.exec;
    const origExecSync = cp.execSync;
    const origExecFile = cp.execFile;
    const origExecFileSync = cp.execFileSync;
    const origSpawn = cp.spawn;
    const origSpawnSync = cp.spawnSync;

    if (typeof origExec === 'function') {
      cp.exec = function execGuard(command, ...args) {
        if (looksLikeRcePayload(command)) {
          console.error('[SECURITY] Blocked suspicious exec command:', command);
          console.error(new Error('[SECURITY] exec stack').stack);
          const err = new Error('Blocked suspicious command execution');
          const cb = typeof args.at(-1) === 'function' ? args.at(-1) : null;
          if (cb) {
            queueMicrotask(() => cb(err, null, null));
            return { pid: 0, killed: true };
          }
          throw err;
        }
        return origExec.call(cp, command, ...args);
      };
    }

    if (typeof origExecSync === 'function') {
      cp.execSync = function execSyncGuard(command, ...args) {
        if (looksLikeRcePayload(command)) {
          console.error('[SECURITY] Blocked suspicious execSync command:', command);
          console.error(new Error('[SECURITY] execSync stack').stack);
          throw new Error('Blocked suspicious command execution');
        }
        return origExecSync.call(cp, command, ...args);
      };
    }

    if (typeof origExecFile === 'function') {
      cp.execFile = function execFileGuard(file, args, ...rest) {
        if (looksLikeRceArgs(file, args)) {
          console.error('[SECURITY] Blocked suspicious execFile:', file, args);
          console.error(new Error('[SECURITY] execFile stack').stack);
          const err = new Error('Blocked suspicious command execution');
          const cb = typeof rest.at(-1) === 'function' ? rest.at(-1) : null;
          if (cb) {
            queueMicrotask(() => cb(err, null, null));
            return { pid: 0, killed: true };
          }
          throw err;
        }
        return origExecFile.call(cp, file, args, ...rest);
      };
    }

    if (typeof origExecFileSync === 'function') {
      cp.execFileSync = function execFileSyncGuard(file, args, ...rest) {
        if (looksLikeRceArgs(file, args)) {
          console.error('[SECURITY] Blocked suspicious execFileSync:', file, args);
          console.error(new Error('[SECURITY] execFileSync stack').stack);
          throw new Error('Blocked suspicious command execution');
        }
        return origExecFileSync.call(cp, file, args, ...rest);
      };
    }

    if (typeof origSpawn === 'function') {
      cp.spawn = function spawnGuard(file, args, ...rest) {
        if (looksLikeRceArgs(file, args)) {
          console.error('[SECURITY] Blocked suspicious spawn:', file, args);
          console.error(new Error('[SECURITY] spawn stack').stack);
          throw new Error('Blocked suspicious command execution');
        }
        return origSpawn.call(cp, file, args, ...rest);
      };
    }

    if (typeof origSpawnSync === 'function') {
      cp.spawnSync = function spawnSyncGuard(file, args, ...rest) {
        if (looksLikeRceArgs(file, args)) {
          console.error('[SECURITY] Blocked suspicious spawnSync:', file, args);
          console.error(new Error('[SECURITY] spawnSync stack').stack);
          return { status: 1, error: new Error('Blocked suspicious command execution') };
        }
        return origSpawnSync.call(cp, file, args, ...rest);
      };
    }
  }

  console.error('[SECURITY] exec-guard installed');
} catch (e) {
  console.error('[SECURITY] exec-guard failed to install:', e && e.message ? e.message : String(e));
}

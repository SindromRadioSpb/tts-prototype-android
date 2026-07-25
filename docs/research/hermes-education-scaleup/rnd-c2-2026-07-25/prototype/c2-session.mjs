import { spawn } from 'node:child_process';

// Amendment A froze the user benchmark to Hermes WebUI before any audio session.
// Keep device discovery for engineering diagnostics, but fail closed before a terminal
// process can capture or transmit microphone audio.
const args = new Set(process.argv.slice(2));
if (args.has('--list-devices')) {
  const child = spawn(
    'ffmpeg',
    ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'],
    { stdio: 'inherit' },
  );
  child.on('exit', () => process.exit(0));
} else {
  console.error('PROBE_ONLY: terminal audio sessions were superseded before first C2 audio. Use the Hermes WebUI “Разговор” surface.');
  process.exitCode = 2;
}

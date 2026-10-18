# Local ASR Companion: install and use

Local ASR transcribes Hebrew audio on your Windows computer. An audio file is never sent to Gemini after a Local ASR error: switching to Gemini is manual and requires separate confirmation.

Since 2026-10-18 the Companion is available to every desktop user; no invitation is needed. The supported configuration is **Windows 11 + compatible NVIDIA/CUDA + Chrome**. Edge and Firefox are not supported yet.

Download the installer: https://github.com/SindromRadioSpb/tts-prototype-android/releases/tag/companion-v0.3.0-beta.15

RU: `/docs/LOCAL_ASR_COMPANION_GUIDE.md`. HE: `/docs/LOCAL_ASR_COMPANION_GUIDE.he.md`.


## Quick path

1. Download and install **LinguistPro Local AI Companion** from the release page (link above, or the ◉ button in Studio).
2. Open **Windows Start → LinguistPro → LinguistPro Local ASR Companion**.
3. Wait for **Companion: RUNNING**.
4. In **Connect LinguistPro in Chrome**, click **Copy token for browser**.
5. Return to LinguistPro: the **◉ Local AI Companion** button in Studio, tick **Use Local AI Companion on this computer**.
6. Paste the token in step 2 and click **Connect**.
7. Run the device check, install the model, and warm it up.
8. Open media import: with the Companion connected, **Local** is selected. Gemini stays in the list as an explicit choice.


## Where to get the pairing token

The Companion creates the token automatically. You do not need to find a file, invent a token, or use a command line.

1. Start the Companion from the Windows Start menu.
2. Find the separate **Connect LinguistPro in Chrome** section near the top of its window.
3. Click **Copy token for browser**.
4. Return to the open LinguistPro tab, paste the token, and click **Connect**.

LinguistPro keeps the token in this browser until you click “Disconnect the Companion in this browser”: no need to paste it again after a browser restart. Do not share the token or include it in diagnostics or screenshots.


## Install the Companion

The installer is not code-signed. Download it only from the release page of this repository and verify its SHA-256 before running it: `1c8d878b40371053ff976691fece3a6ca06664982653e56b647cebfaa132dde3` (build 0.3.0-beta.15).

If Windows shows SmartScreen:

1. First verify the SHA-256 shown on the release page.
2. Only for a matching trusted build, choose **More info → Run anyway**.
3. Stop if the checksum is missing or does not match.

Installation is per-user and does not require manual Python, venv, or Uvicorn setup.


## Check the computer

Click **Run preflight** in the Local ASR web screen. It checks Windows 11, NVIDIA/CUDA and free VRAM, disk space, local port `127.0.0.1:8799`, and bundled FFmpeg/FFprobe. Resolve a reported check before continuing. Local ASR never silently changes its model, compute/decode, VAD, or timestamp policy.


## Companion settings

The **Settings** block in the Companion window:

- **Language** — English or Russian. It applies immediately, is stored for this Windows account, and the Help button opens the guide in the language you chose.
- **Video conversion** — on the processor (`libx264`, the same file on any computer) or on the NVIDIA graphics card (`h264_nvenc`, faster, a somewhat larger file). The Companion checks whether the card really encodes on this machine and prints the result under the switch.

Both settings live in `%LOCALAPPDATA%\LinguistPro\LocalASR\state\settings.json` and take effect without restarting the service. The `AI_LOCAL_MEDIA_HW_ENCODER` environment variable is honoured only while the window has never made a choice: an installed application with an autostart entry inherits its environment from whichever process spawned it, so the environment cannot be the channel that turns an option on.

For a single file the choice can be overridden in Studio: **Add material → From device →** the "Encode the video on" row. It appears only when the video is really re-encoded and this computer has proved both encoders. The technical details always name the encoder — before the conversion and after it — together with the fallback reason if the card was asked for and did not run.


## Install the model

The model downloads only after confirmation. The download is about **1.62 GB** and additional free space is needed for verification and safe activation.

Only this model is accepted:

`ivrit-ai/whisper-large-v3-turbo-ct2@72ad623a37947395efcc3933132353790e5a12f5`

The Companion verifies the exact revision and SHA-256 of every runtime file before activation. A corrupt or partial download is never activated. You can cancel and retry the download.


## Transcribe audio

1. Make sure the Companion is running, the browser is connected, the model is verified, and warmup completed.
2. Click **Open audio import** and choose a file.
3. Explicitly select **Local** as the provider.
4. Start transcription and wait for a terminal status.
5. Review the text and save the card normally.

Gemini is not called automatically after a Local error. To retry with Gemini, switch manually and separately confirm cloud upload.


## Returning later

1. Open the Companion from Windows Start.
2. Click **Start** if stopped, or **Restart** if the state is stuck.
3. Click **Copy token for browser** again and connect the current LinguistPro tab.
4. You do not need to download the model again when it says **Verified and ready**.
5. Explicitly select **Local** for every new import.


## Common errors

| Message | Action |
|---|---|
| Companion unavailable | Open it, click Start or Restart, and copy the token again. |
| Pairing failed | Copy the current token, replace the field completely, and click Connect. |
| Port 8799 in use | Stop the other program or restart after freeing the port. |
| Disk space low | Free local disk space and rerun preflight. |
| Model integrity / checksum | Delete the managed partial/model files and retry the same pinned revision. |
| OOM / insufficient VRAM | Close GPU-heavy apps, restart, and retry. There is no hidden CPU fallback. |
| Warmup failed | Check preflight and model status, Restart, then warm up again. |


## Data, diagnostics, and removal

- **Delete model** removes the pinned model.
- **Delete jobs** removes local jobs, source media, and outputs.
- **Export redacted diagnostics** excludes audio, transcript text, original filenames, and pairing tokens.
- Uninstall stops the owned service and removes managed model/jobs/state for this Windows user.

Save any text card you need in the LinguistPro Library before deleting Local ASR jobs.


## Privacy boundary

The Companion listens only on `127.0.0.1:8799`. Pairing token, Origin/PNA/CORS checks, and request body caps remain mandatory. Local ASR media and results stay in the managed directories of the current Windows account.

The LinguistPro web page and other features you choose may still use the network. This ASR task performs no cloud upload unless you manually choose Gemini and confirm the switch.

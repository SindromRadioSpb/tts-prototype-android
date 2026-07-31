# LinguistPro Local ASR Companion — third-party notices

This file applies to the Windows invite-only beta Companion. The Companion is distributed
separately from the LinguistPro web application and does not include model weights.

## Pinned Hebrew ASR model

- Work: `ivrit-ai/whisper-large-v3-turbo-ct2`
- Revision: `72ad623a37947395efcc3933132353790e5a12f5`
- License declared by the model repository: Apache License 2.0
- Source: <https://huggingface.co/ivrit-ai/whisper-large-v3-turbo-ct2>

The model is downloaded only after explicit user confirmation and is verified against the
runtime-file SHA-256 manifest committed with LinguistPro.

## Runtime components

The frozen Companion includes Python and open-source packages used by the local service,
including FastAPI, Uvicorn, faster-whisper 1.1.1, CTranslate2 4.5.0, PyAV, psutil, and their
runtime dependencies. Their license metadata and source distributions are available from:

- <https://www.python.org/>
- <https://github.com/fastapi/fastapi>
- <https://www.uvicorn.org/>
- <https://github.com/SYSTRAN/faster-whisper>
- <https://github.com/OpenNMT/CTranslate2>
- <https://github.com/PyAV-Org/PyAV>
- <https://github.com/giampaolo/psutil>

The installer also bundles FFmpeg/ffprobe 8.1 from the detected Windows build toolchain.
FFmpeg is licensed under the GNU LGPL v2.1 or later unless the selected build enables optional
GPL components; the internal build report must record the exact `ffmpeg -version` configuration
before any external distribution decision.

The frozen Windows runtime also includes pinned NVIDIA CUDA redistributable packages required
by CTranslate2: `nvidia-cudnn-cu12==9.10.2.21` and
`nvidia-cublas-cu12==12.1.3.1`. These are NVIDIA proprietary software, not Apache-2.0 software.
Their supplied `License.txt` files are included under `licenses/` in the installed runtime. Any
external beta distribution requires an explicit license review in addition to code signing.

## Apache License 2.0 notice

Apache License 2.0 terms are available at <https://www.apache.org/licenses/LICENSE-2.0>.
The license permits use, reproduction, and distribution subject to its conditions, including
preserving required copyright, patent, attribution, and NOTICE information.

This notice is informational and does not replace the full license text shipped by each upstream
component. An external beta release must regenerate and review a complete frozen-package license
inventory before signing and distribution.

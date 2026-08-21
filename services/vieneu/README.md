# VieNeu local TTS service

This process keeps the VieNeu model loaded and exposes it only on localhost.

```powershell
py -3.10 -m venv .venv-vieneu
.\.venv-vieneu\Scripts\python.exe -m pip install --upgrade pip
.\.venv-vieneu\Scripts\python.exe -m pip install -r services\vieneu\requirements.txt
$env:VIENEU_MODEL='pnnbao-ump/VieNeu-TTS-v2'
$env:VIENEU_BACKBONE_DEVICE='cpu'
$env:VIENEU_CODEC_DEVICE='cpu'
.\.venv-vieneu\Scripts\python.exe services\vieneu\app.py
```

The first launch downloads model files from Hugging Face. Keep this service running while the Node application is generating narration.

Health check: `http://127.0.0.1:8787/health`

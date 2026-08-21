import sys

try:
    import torch
    print(f"[CUDA Check] PyTorch Version: {torch.__version__}")
    cuda_available = torch.cuda.is_available()
    print(f"[CUDA Check] CUDA Available: {cuda_available}")
    if cuda_available:
        print(f"[CUDA Check] Device Count: {torch.cuda.device_count()}")
        print(f"[CUDA Check] Device Name: {torch.cuda.get_device_name(0)}")
    else:
        print("\n[PyTorch is currently running on CPU]")
        print("To enable CUDA GPU acceleration for WhisperX, run the following in your command prompt:")
        print("  .venv-asr\\Scripts\\pip.exe install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121")
except Exception as err:
    print(f"[CUDA Check Error] {err}")

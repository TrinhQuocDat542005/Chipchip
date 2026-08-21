import sys
import asyncio

async def main():
    if len(sys.argv) < 3:
        print("Usage: python edge_tts_cli.py <text> <voice> <output_path> [rate]")
        sys.exit(1)

    text = sys.argv[1]
    voice = sys.argv[2]
    output_path = sys.argv[3]
    rate = sys.argv[4] if len(sys.argv) > 4 else "+0%"

    import edge_tts
    communicate = edge_tts.Communicate(text, voice, rate=rate)
    await communicate.save(output_path)
    print(f"EDGE_TTS_SUCCESS:{output_path}")

if __name__ == "__main__":
    asyncio.run(main())

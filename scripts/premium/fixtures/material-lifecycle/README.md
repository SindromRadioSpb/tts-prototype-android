# Local playback fixture

`three-second.mp4` is synthetic: three seconds of a navy frame and a 440 Hz tone,
160×90, H.264 baseline / AAC. It contains no user recording.

Generated with:

```sh
ffmpeg -f lavfi -i 'color=c=navy:s=160x90:r=10:d=3' -f lavfi -i 'sine=frequency=440:sample_rate=16000:duration=3' -c:v libx264 -profile:v baseline -pix_fmt yuv420p -c:a aac -movflags +faststart -shortest three-second.mp4
```

The portable-package browser regression uses real decodable bytes instead of a
text buffer named `.mp4`. SHA-256 is computed from the fixture at test time.

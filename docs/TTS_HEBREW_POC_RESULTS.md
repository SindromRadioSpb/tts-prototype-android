# TTS Hebrew PoC Results

Дата: 2026-04-22

Исходные WAV сгенерированы через:

`phonikud-onnx -> phonikud.phonemize() -> piper-onnx + shaul.onnx`

## Aggregate Timing

- phrases: 8
- avg `g2pMs`: 53.5
- avg `ttsMs`: 92.4
- avg `totalMs`: 158.9
- min `totalMs`: 71.2
- max `totalMs`: 231.3

## Phrase Table

| Phrase | Vocalized | Phonemes | WAV | G2P ms | TTS ms | Total ms | Quality note |
|---|---|---|---|---:|---:|---:|---|
| שלום עולם | שְׁלוֹם עוֹלָם | ʃlˈom ʔolˈam | [01_643cbc0fbf.wav](/E:/projects/tts-prototype-android/experiments/hebrew_tts_phonikud_piper/out/01_643cbc0fbf.wav) | 112.2 | 42.4 | 231.3 | Manual listening pending |
| ברוך אתה | בָּרוּךְ אַתָּה | baʁˈuχ ʔatˈa | [02_3572825e3d.wav](/E:/projects/tts-prototype-android/experiments/hebrew_tts_phonikud_piper/out/02_3572825e3d.wav) | 20.7 | 47.7 | 71.8 | Manual listening pending |
| בָּרוּךְ אַתָּה | בָּרוּךְ אַתָּה | baʁˈuχ ʔatˈa | [03_0c7d5684f2.wav](/E:/projects/tts-prototype-android/experiments/hebrew_tts_phonikud_piper/out/03_0c7d5684f2.wav) | 18.7 | 45.9 | 71.2 | Manual listening pending |
| העברית היא שפה עתיקה ומתחדשת. | הָ|עִבְרִית הִיא שָׂפָה עַתִּיקָה וּ|מִתְחַדֶּ֫שֶׁת. | haʔivʁˈit hˈi safˈa ʔatikˈa umitχadˈeʃet. | [04_2535c9be46.wav](/E:/projects/tts-prototype-android/experiments/hebrew_tts_phonikud_piper/out/04_2535c9be46.wav) | 43.0 | 91.7 | 138.1 | Manual listening pending |
| אני רוצה לשמוע את הטקסט הזה בעברית טבעית. | אֲנִי רוֹצֶה לִשְׁמֹ֫ועַ אֶת הַ|טֵּקְסְט הַ|זֶּה בְּֽ|עִבְרִית טִבְעִית. | ʔanˈi ʁotsˈe liʃmˈoa ʔˈet hatˈekst hazˈe beʔivʁˈit tivʔˈit. | [05_7c54c16922.wav](/E:/projects/tts-prototype-android/experiments/hebrew_tts_phonikud_piper/out/05_7c54c16922.wav) | 60.0 | 119.9 | 183.9 | Manual listening pending |
| הילדים אהבו במיוחד את הסיפורים הללו שהמורה הקריאה. | הַ|יְּֽלָדִים אָהֲבוּ בִּמְיֻוחָד אֶת הַ|סִּיפּוּרִים הַלָּ֫לוּ שֶׁהַ|מּוֹרֶה הִקְרִיאָה. | hajeladˈim ʔahavˈu bimjuχˈad ʔˈet hasipuʁˈim halˈalu ʃehamoʁˈe hikʁiʔˈa. | [06_e76866dde1.wav](/E:/projects/tts-prototype-android/experiments/hebrew_tts_phonikud_piper/out/06_e76866dde1.wav) | 64.7 | 139.2 | 207.0 | Manual listening pending |
| זהו מבחן קצר של מערכת דיבור בעברית. | זֶ֫הוּ מִבְחָן קָצָר שֶׁל מַעֲרֶ֫כֶת דִּיבּוּר בְּֽ|עִבְרִית. | zˈehu mivχˈan katsˈaʁ ʃˈel maʔaʁˈeχet dibˈuʁ beʔivʁˈit. | [07_1a1c1d8d6d.wav](/E:/projects/tts-prototype-android/experiments/hebrew_tts_phonikud_piper/out/07_1a1c1d8d6d.wav) | 48.2 | 128.8 | 180.5 | Manual listening pending |
| אני לומד עברית ורוצה לשמוע כל מילה בצורה ברורה. | אֲנִי לוֹמֵד עִבְרִית וְֽ|רוֹצֶה לִשְׁמֹ֫ועַ כׇּל מִילָּה בְּֽ|צוּרָה בְּרוּרָה. | ʔanˈi lomˈed ʔivʁˈit veʁotsˈe liʃmˈoa kˈol milˈa betsuʁˈa bʁuʁˈa. | [08_5048986866.wav](/E:/projects/tts-prototype-android/experiments/hebrew_tts_phonikud_piper/out/08_5048986866.wav) | 60.5 | 123.4 | 187.3 | Manual listening pending |

## Notes

- All phrases produced valid WAV files.
- `phonikud` inserted enhanced markers such as `|` and stress marks before phonemization.
- On Windows the original `model.config.json` had to be rewritten to an ASCII-only JSON copy for `piper-onnx`.

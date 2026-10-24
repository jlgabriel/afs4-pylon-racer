# Third-party notices

## Air-race pylon models — krzysk1 (MIT)

The pylon models in `assets/pylons/pylon_*/` (`.tmb` geometry and `.ttx` textures) are the air-race
pylons from **krzysk1's Reno Air Race** package for Aerofly FS, used unmodified. Pylon Racer copies the ones a
course uses into the scenery it installs, together with this license.

```
MIT License

Copyright (c) 2019 krzysk1

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Air-race pylon models — Rodeo (used with permission)

The pylon models in `assets/pylons/rodeo_*/` (`pylon_reno_3`, `pylon_air_race_18_4`,
`pylon_air_race_25_5`, with their `.ttx` textures) are by **Rodeo** (Aerofly FS 4 community), made with
AC3D and packaged in the `xref_air_race_pylons` XREF library by **@Apfelflieger**. They are used
unmodified, with the author's permission: asked on the Aerofly FS 4 forum (post #257) whether Pylon
Racer could ship them, Rodeo answered "You can use whatever you need." They are not covered by
Pylon Racer's license; each folder carries a `__CREDITS.txt` that is copied with the model into the
scenery the app installs.

## AeroflyReader.dll — Juan Luis Gabriel (MIT)

`vendor/aerofly-reader/AeroflyReader.dll` is the read-only Aerofly FS 4 plug-in from
[Aerofly-FS4-Bridge](https://github.com/jlgabriel/Aerofly-FS4-Bridge) (`simplified/`), by the author
of Pylon Racer, under the MIT License (`vendor/aerofly-reader/LICENSE.txt`). It is not part of the
app: each release offers it as a separate download, `AeroflyReader.zip`, with that license.

## Fonts (SIL Open Font License 1.1)

The app bundles two typefaces, through the `@fontsource` packages, under the
[SIL Open Font License 1.1](https://openfontlicense.org):

- **Inter** — © 2016 The Inter Project Authors (https://github.com/rsms/inter).
- **Barlow Semi Condensed** — © 2017 The Barlow Project Authors (https://github.com/jpt/barlow).

## Map data

The course designer shows map tiles from **Esri World Imagery** (satellite) and **OpenStreetMap**
(© OpenStreetMap contributors), credited on the map. Terrain elevations come from the
**Open-Meteo** elevation API. Place search uses **Nominatim** (© OpenStreetMap contributors).

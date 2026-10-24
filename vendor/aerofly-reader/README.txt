AeroflyReader.dll 1.1.0 - optional high-rate data source for Pylon Racer (Windows)
==================================================================================

With this plug-in loaded, Aerofly FS 4 streams your flight to Pylon Racer at about 40 Hz instead of
the ~5 Hz of the built-in UDP broadcast, with the height above ground and the aircraft you fly
(which puts your runs in the right aircraft class).

Install
-------
1. Close Aerofly FS 4.
2. Copy AeroflyReader.dll into   Documents\Aerofly FS 4\external_dll\
   (create the external_dll folder if it is not there).
3. Start Aerofly FS 4 and Pylon Racer. The top bar shows "DLL 40 Hz" once you are flying.

To remove it, delete the file from external_dll.

About
-----
Read-only: it never controls the aircraft. It serves the data on TCP port 12345 and in shared
memory ("AeroflyReaderData").

Source: https://github.com/jlgabriel/Aerofly-FS4-Bridge (folder simplified/), built from commit
45ac24b. MIT License, see LICENSE.txt.
SHA-256: 98734e58c0b389b04b867da00a7379744c51619062574d55f968bdca85f68215

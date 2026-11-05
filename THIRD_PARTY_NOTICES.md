# Third-party notices

## Visual Studio Code default theme data

The reference fixtures and bundled baseline themes are derived from the default
themes in [Microsoft's Visual Studio Code repository](https://github.com/microsoft/vscode),
commits `2d0b7506a36c1d6db9a466440131a8e01eab2289` (Dark, VS Code 1.143.0)
and `e646868227c3e3a9e3f24277c8c7220be42c0be7` (Light, VS Code 1.143.1).

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the MIT License:

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

## Runtime dependencies

Culori and jsonc-parser are used under their respective MIT licenses. The build
retains bundled license comments. Their source and license files are available
in the corresponding npm packages.

## VS Code Codicons

The bundled UI artwork is from
[VS Code Codicons](https://github.com/microsoft/vscode-codicons), copyright
Microsoft Corporation, under
[Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).
The artwork is unchanged; its markup is adapted for inline decorative icons.
The source attribution is in [the Codicons notice](src/webview/codicons-LICENSE.txt).
The packaged extension includes that notice and the runtime dependency license
texts in `dist/THIRD_PARTY_LICENSES.txt`.

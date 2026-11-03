# 第三方许可与资料边界

本项目原创代码与文档使用 [GPL-3.0-only](LICENSE)。第三方组件仍保留其原有版权、许可证和 NOTICE；项目许可不替代这些声明。本文件是来源索引，不是第三方许可证全文，也不是对所有引用资料的再分发授权。

## 软件依赖

以下为 `package-lock.json` 当前锁定的生产依赖声明。更新依赖后应重新核对；最终分发哪些组件，以实际构建内容为准。

| 组件 | 版本 | 上游许可 |
|---|---|---|
| React / React DOM | 19.2.7 | MIT |
| Dexie | 4.4.4 | Apache-2.0 |
| dexie-react-hooks | 4.4.0 | Apache-2.0 |
| Leaflet | 1.9.4 | BSD-2-Clause |
| lucide-react | 1.25.0 | ISC；图标的附加声明见包内 LICENSE |
| Tesseract.js / tesseract.js-core | 7.0.0 | Apache-2.0 |
| bmp-js | 0.1.0 | MIT |
| idb-keyval | 6.3.0 | Apache-2.0 |
| is-url | 1.2.4 | MIT |
| node-fetch | 2.7.0 | MIT |
| opencollective-postinstall | 2.0.3 | MIT |
| regenerator-runtime | 0.13.11 | MIT |
| scheduler | 0.27.0 | MIT |
| tr46 | 0.0.3 | MIT |
| wasm-feature-detect | 1.8.0 | Apache-2.0 |
| webidl-conversions | 3.0.1 | BSD-2-Clause |
| whatwg-url | 5.0.0 | MIT |
| zlibjs | 0.3.1 | MIT |

依赖来源与完整性由锁文件记录。构建会从安装包收集完整 LICENSE / LICENCE / COPYING 和 NOTICE，生成 `dist/licenses/THIRD_PARTY_LICENSES.txt`，覆盖上述生产依赖（包括未必进入浏览器的 Node 辅助包）。它保留 Lucide 的 Feather/MIT 附加声明和 Dexie 的 NOTICE，不仅复制许可证名称。tr46 0.0.3 的包缺少全文，补充文本及来源见 [licenses/README.md](licenses/README.md)。缺少许可证或安装版本与锁文件不一致会使构建失败，避免静默漏带。

Windows 安装候选另外包含 Electron 45.1.0 及其 Chromium 等运行组件。应用目录保留运行时自带的 `LICENSE.electron.txt`（Electron 的 MIT 许可）和 `LICENSES.chromium.html`（运行组件的第三方声明）；它们不属于上表的前端 npm 生产依赖收集范围，重新打包时同样必须保留。

MIT、BSD-2-Clause、ISC 与 Apache-2.0 可以用于 GPL v3 项目，但仍须履行各自的声明保留要求。参见 [GNU 兼容许可证说明](https://www.gnu.org/licenses/license-list.html)和 [Apache 的 GPL 兼容性说明](https://www.apache.org/licenses/GPL-compatibility.html)。构建工具与测试工具的许可同样以各自包内声明为准。

## OCR、图标与阅读资料

- 随仓库保存的 OCR 语言文件来源、版本及校验值见 [OCR LICENSES.txt](public/reader-ocr/LICENSES.txt)。npm 包元数据声明 MIT，但不应据此重新授权底层训练数据；其上游 tessdata_best 使用 Apache-2.0，[完整文本](public/reader-ocr/LICENSE-Apache-2.0.txt)随数据保留。现有 gzip 文件与 npm 发布包的 `4.0.0_best_int` 文件逐字节一致，未作二次修改。
- 项目图标的生成方式与参考来源见 [assets/README.md](assets/README.md)。第三方品牌或参考素材的权利不会因项目使用 GPL 而转让。
- 正式书籍资料位于 `public/presets/reading-companion/`，引用与来源信息保留在资料包中。书名、书目元数据、外部链接或背景引用不构成对书籍正文、译文、封面或外部网站内容的再授权。
- 地图瓦片、地名检索服务与地图数据适用其提供方的许可和使用政策。分发或修改应用时保留地图上的来源署名，不把项目 GPL 当成地图服务的使用许可。
- 用户输入的原文、截图、阅读备注、书目和备份不因使用本软件而自动获得 GPL 许可，也没有因本项目许可证而必须公开的义务。

## 构建产物与再分发

分发源码时保留根目录 LICENSE、本文件和已有第三方声明。分发 `dist/`、托管浏览器应用或今后的安装包时，还应：

1. 按 GPL v3 提供与分发版本对应的完整源码、必要的构建脚本及许可证，不能只提供压缩 JavaScript 或指向不对应版本的源码。
2. 保留构建生成的整个 `licenses/` 目录及 `reader-ocr/` 下的许可文件；构建自动附带项目 GPL 全文、上述依赖的完整许可与必要 NOTICE，以及 OCR 来源与 Apache-2.0 文本。本索引不能代替这些全文。新增外部资源、原生组件或不同分发渠道时，应重新核对对应的声明要求。
3. 核对地图署名与正式资料的引用范围；未经授权的正文、封面或其他素材不能随包加入。

目前提供可构建的 Windows 安装候选，尚未正式发布；自动收集与运行时自带声明解决已核对组件的文本随包问题，不代替书籍引用、地图服务使用条件或其他平台分发的独立审核。

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

依赖来源与完整性由锁文件记录。运行 `npm ci` 后，可在对应 `node_modules/<包名>/` 中查看上游附带的 LICENSE、LICENCE、LICENSE.md、LICENSE.txt、NOTICE 或 README 中的声明；缺少全文时应从该版本的上游发布资料核实，不能仅凭包元数据补写版权人。

MIT、BSD-2-Clause、ISC 与 Apache-2.0 可以用于 GPL v3 项目，但仍须履行各自的声明保留要求。参见 [GNU 兼容许可证说明](https://www.gnu.org/licenses/license-list.html)和 [Apache 的 GPL 兼容性说明](https://www.apache.org/licenses/GPL-compatibility.html)。构建工具与测试工具的许可同样以各自包内声明为准。

## OCR、图标与阅读资料

- 随仓库保存的 OCR 语言文件来源、版本及校验值见 [OCR LICENSES.txt](public/reader-ocr/LICENSES.txt)。该文件记录的语言包许可为 MIT；分发这些二进制资源时仍需保留上游对应的完整许可和版权声明。
- 项目图标的生成方式与参考来源见 [assets/README.md](assets/README.md)。第三方品牌或参考素材的权利不会因项目使用 GPL 而转让。
- 正式书籍资料位于 `public/presets/reading-companion/`，引用与来源信息保留在资料包中。书名、书目元数据、外部链接或背景引用不构成对书籍正文、译文、封面或外部网站内容的再授权。
- 地图瓦片、地名检索服务与地图数据适用其提供方的许可和使用政策。分发或修改应用时保留地图上的来源署名，不把项目 GPL 当成地图服务的使用许可。
- 用户输入的原文、截图、阅读备注、书目和备份不因使用本软件而自动获得 GPL 许可，也没有因本项目许可证而必须公开的义务。

## 构建产物与再分发

分发源码时保留根目录 LICENSE、本文件和已有第三方声明。分发 `dist/`、托管浏览器应用或今后的安装包时，还应：

1. 按 GPL v3 提供与分发版本对应的完整源码、必要的构建脚本及许可证，不能只提供压缩 JavaScript 或指向不对应版本的源码。
2. 整理实际包含的第三方组件、OCR 资源的完整许可证、版权及必要 NOTICE，并随分发物保留；本索引不能代替这些全文。
3. 核对地图署名与正式资料的引用范围；未经授权的正文、封面或其他素材不能随包加入。

目前仓库尚未提供原生安装包；本次许可选择不表示已完成所有发布渠道的分发物许可打包检查。

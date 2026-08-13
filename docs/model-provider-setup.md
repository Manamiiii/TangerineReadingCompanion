# 模型供应商配置

阅读伴侣和洛克王国的受限模型任务通过 OpenAI Chat Completions 兼容协议调用外部模型。阅读伴侣可以发现当前段落名称、准备个人隐藏词典、解释当前内容、整理书目信息和地图检索词；洛克王国可以纠正低置信 OCR 候选、说明收集记录检查结果和解释确定性的性格结论。各任务使用独立提示词和输出校验，模型不能自动改写正式资料、性格分档或收集记录。

## 两套独立配置

阅读伴侣与洛克王国分别维护模型配置。阅读伴侣可以选择更适合长文本和较大上下文的模型；洛克王国可以选择更适合短文本、结构化 JSON 和快速响应的模型。洛克王国扫描纠错、收集记录检查和性格解释共用同一套洛克王国配置。

两侧设置都提供“复制对方配置”。复制只把对方当前的供应商、接口、模型和当前会话 Key 载入表单；用户保存后形成独立快照，之后修改任意一侧都不会同步到另一侧。对方尚未保存配置时，复制按钮不可用。

兼容存储键 `readerModel*` 属于阅读伴侣配置。洛克王国不隐式继承它；首次使用时可以在洛克王国模型设置中显式复制阅读伴侣配置。

## 工具内配置

进入：

```text
经典文学阅读 → 选择书籍 → 设置 → 模型服务
```

洛克王国配置可以从扫描器、收集记录智能检查或性格结果旁的模型设置按钮进入；这三个入口保存到同一套洛克王国配置。

操作顺序：

1. 选择模型供应商。
2. 从建议列表选择模型 ID，或手动填写供应商当前支持的模型 ID。
3. 在供应商控制台创建 API Key 并粘贴。
4. 点击“保存并切换到此模型”。
5. 回到“阅读输入”，放入一段不敏感的短文字进行名称识别或当前内容答疑；创建个人书籍时也可以保留“创建后用 AI 准备基础资料”勾选。

每个使用域、每个供应商的接口地址和模型 ID 分别保存在当前浏览器的 `localStorage`。各域、各供应商的 API Key 分别保存在 `sessionStorage`，关闭浏览器会话后失效；Key 不进入 IndexedDB、数据导出或仓库。切换供应商时，当前域在本次会话内已经保存过的对应 Key 会自动恢复。

## 智谱 GLM

推荐作为首次免费测试。

```text
供应商：智谱 GLM
接口地址：https://open.bigmodel.cn/api/paas/v4/chat/completions
模型 ID：glm-4-flash-250414
```

- `GLM-4-Flash-250414` 是智谱文档标明的免费 API 模型，适合名称提取和 JSON 输出。
- 国内网络可以直接访问。
- 在[智谱 API Key 管理](https://bigmodel.cn/usercenter/proj-mgmt/apikeys)创建 Key。
- 以[智谱免费模型说明](https://docs.bigmodel.cn/cn/guide/models/free/glm-4-flash-250414)和控制台当前状态为准。

## DeepSeek

DeepSeek API 按 Token 计费，没有稳定的长期免费模型，但轻量模型费用较低。

```text
供应商：DeepSeek
接口地址：https://api.deepseek.com/chat/completions
模型 ID：deepseek-v4-flash
```

需要更强模型时可改为：

```text
deepseek-v4-pro
```

- 不使用已经弃用的 `deepseek-chat` 和 `deepseek-reasoner` 名称。
- 在[DeepSeek API Key 管理](https://platform.deepseek.com/api_keys)创建 Key。
- 当前模型和价格以[DeepSeek 接入及模型说明](https://api-docs.deepseek.com/quick_start/pricing-details-usd/)为准。

## MiniMax

MiniMax 当前属于付费测试路线。阅读伴侣会为该供应商使用 `0.1` 温度，以满足其文本 API 对温度必须大于 0 的要求。

```text
供应商：MiniMax
接口地址：https://api.minimaxi.com/v1/chat/completions
模型 ID：MiniMax-M2.7
```

也可以测试：

```text
MiniMax-M2.7-highspeed
```

- 在[MiniMax 接口密钥](https://platform.minimaxi.com/user-center/basic-information/interface-key)创建 Key。
- 模型参数和计费以[MiniMax OpenAI 兼容接口](https://platform.minimaxi.com/docs/api-reference/text-chat-openai)为准。

## OpenAI 与自定义接口

OpenAI 保留原有配置入口：

```text
供应商：OpenAI
接口地址：https://api.openai.com/v1/chat/completions
模型 ID：按 OpenAI 当前模型目录填写
```

“自定义兼容接口”用于其他 OpenAI Chat Completions 兼容服务或本机模型：

```text
供应商：自定义兼容接口
接口地址：完整的 /chat/completions 地址
模型 ID：服务端实际暴露的模型 ID
```

公网自定义接口必须使用 HTTPS；只有 `localhost`、`127.0.0.1` 和 `[::1]` 可以使用 HTTP。

## 测试与排错

建议所有供应商使用同一段不涉及隐私和剧透的文字测试，并比较：

- 是否只返回原文中实际出现的名称。
- 是否把普通名词误识别成人名或地点。
- 地点无法确认现实时是否保持“不确定”。
- 返回是否稳定为 JSON。
- 响应速度、频率限制和实际 Token 消耗。

常见错误：

- `401`：API Key 错误、过期，或 Key 不属于当前地域/业务空间。
- `404`：完整接口地址或模型 ID 错误。
- `429`：免费模型频率限制、余额不足或额度耗尽。
- “模型返回的不是有效 JSON”：模型没有遵守窄范围结构化输出；可换用更稳定的指令模型重试。
- “网络不可用或接口不允许浏览器访问”：供应商跨域策略或本机网络阻止浏览器直连。

免费政策、模型名称和价格会变化。工具预设只提供可编辑的起点，不替代供应商控制台中的实时模型状态、额度和账单信息。

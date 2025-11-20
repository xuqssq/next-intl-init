
# next-intl-init

一个基于 AI 的国际化翻译自动化工具，用于批量翻译 JSON 格式的多语言文件，自动保持 JSON 结构和键名完整性。

## 核心特性

- **AI 智能翻译**：使用 OpenRouter API（支持 GPT-4、Claude 等多种模型）
- **批量并行处理**：支持自定义批次大小和并行数量，大幅提升翻译效率
- **结构保护**：严格保持 JSON 嵌套结构，确保所有键名不变
- **自动重试机制**：内置指数退避重试策略，应对 API 限流和网络问题
- **进度实时保存**：翻译过程中持续保存，支持中断后继续
- **完整性验证**：自动检查翻译前后的键完整性
- **多语言并行**：同时翻译多个目标语言

## 快速开始

### 1. 初始化项目

在您的项目根目录运行：

```bash
npx next-intl-init
```

此命令会自动创建以下文件：

```
your-project/
├── scripts/
│   └── i18n/
│       ├── constants.mjs    # 配置文件
│       ├── translate.mjs    # 翻译脚本
│       └── verify_key.mjs   # 验证脚本
└── package.json             # 自动添加 i18n 相关脚本
```

### 2. 安装依赖

```bash
npm install
# 或
yarn install
```

初始化脚本会自动在 `package.json` 中添加以下依赖：
- `ai` - AI SDK 核心库
- `@openrouter/ai-sdk-provider` - OpenRouter 提供商
- `zod` - 数据验证库

### 3. 配置 API 密钥

编辑 `scripts/i18n/translate.mjs`，配置您的 OpenRouter API 密钥：

```javascript
const OPEN_ROUTER_KEY = "your-openrouter-api-key"; // 替换为您的密钥
```

**获取 API 密钥**：访问 [OpenRouter](https://openrouter.ai/) 注册并获取密钥。

### 4. 准备源文件

在 `src/i18n/messages/` 目录下创建英文源文件 `en.json`：

```json
{
  "welcome": "Welcome to our application",
  "user": {
    "name": "Name",
    "email": "Email Address"
  },
  "buttons": {
    "save": "Save",
    "cancel": "Cancel"
  }
}
```

### 5. 运行翻译

```bash
npm run i18n
```

### 6. 验证翻译结果

```bash
npm run i18n_verify
```

## 配置说明

### 基础配置（scripts/i18n/constants.mjs）

```javascript
// 源文件路径
export const ORIGINAL_JSON = path.resolve(process.cwd(), "src/i18n/messages/en.json");

// 翻译文件输出目录
export const TRANSLATED_DIR = path.resolve(process.cwd(), "src/i18n/messages");

// 每批次翻译的条目数（建议 50-100）
export const INPUT_COUNT = 50;

// 并行批次数（如需翻译多个语言，建议设置为 5-10）
export const PARALLEL_BATCHES = 10;

// 最大重试次数
export const MAX_RETRIES = 5;

// 重试延迟时间（毫秒）
export const RETRY_DELAY = 3000;

// 目标语言列表
export const OUTPUT_LIST = [
  {
    language: "中文-zh",      // 语言描述（用于 AI 理解）
    outputname: "zh.json",   // 输出文件名
  },
  {
    language: "法语-fr",
    outputname: "fr.json",
  },
  {
    language: "德语-de",
    outputname: "de.json",
  },
];
```

### 模型配置（scripts/i18n/translate.mjs）

默认使用 OpenRouter 的 `openai/gpt-4o-mini` 模型：

```javascript
const openrouter = createOpenRouter({
  apiKey: OPEN_ROUTER_KEY,
});
const model = openrouter("openai/gpt-4o-mini");
```

**可选模型**：
- `openai/gpt-4o` - 更高质量，成本更高
- `anthropic/claude-3.5-sonnet` - Anthropic Claude 模型
- 更多模型参见 [OpenRouter Models](https://openrouter.ai/models)

## 工作原理

### 翻译流程

1. **JSON 扁平化**：将嵌套 JSON 转换为路径-值对数组
   ```javascript
   // 原始 JSON
   { "user": { "name": "Name" } }

   // 扁平化后
   [{ path: ["user", "name"], value: "Name" }]
   ```

2. **批次处理**：按 `INPUT_COUNT` 分批，避免单次请求过大

3. **并行翻译**：同时处理多个批次，按 `PARALLEL_BATCHES` 控制并发

4. **实时保存**：每完成一组批次，立即保存进度到文件

5. **结构重建**：翻译完成后，将扁平数据还原为原始嵌套结构

### 翻译策略

- **仅翻译值**：严格保持所有 JSON 键名不变
- **保留占位符**：`{name}` 等变量不被翻译
- **保持空值**：`null`、`""`、数字等非字符串值保持原样
- **品牌名保护**：如 "BestStock AI" 等品牌名不翻译

## 常见场景

### 调整批次大小

根据 JSON 文件大小调整：

```javascript
// 小文件（< 500 条）
export const INPUT_COUNT = 100;
export const PARALLEL_BATCHES = 10;

// 大文件（> 5000 条）
export const INPUT_COUNT = 50;
export const PARALLEL_BATCHES = 5;
```

### 翻译更多语言

在 `OUTPUT_LIST` 中添加：

```javascript
export const OUTPUT_LIST = [
  { language: "西班牙语-es", outputname: "es.json" },
  { language: "葡萄牙语-pt", outputname: "pt.json" },
  { language: "俄语-ru", outputname: "ru.json" },
  { language: "阿拉伯语-ar", outputname: "ar.json" },
  // ... 更多语言
];
```

### 处理 API 限流

如果遇到 429 错误（请求过多）：

```javascript
// 降低并行度
export const PARALLEL_BATCHES = 3;

// 增加重试延迟
export const RETRY_DELAY = 5000;
```

## 验证脚本

运行 `npm run i18n_verify` 会检查：

- **缺失的键**：源文件存在但翻译文件中缺失的键
- **多余的键**：翻译文件存在但源文件中没有的键

输出示例：

```
[中文-zh] zh.json 检查结果:
  没有缺失 key。
  没有多余 key。

[法语-fr] fr.json 检查结果:
  缺失 key (2):
   - user.phone
   - settings.theme
  没有多余 key。
```

## 故障排查

### API 密钥错误

错误：`401 Unauthorized`

解决：检查 `OPEN_ROUTER_KEY` 是否正确配置。

### 翻译中断

如果翻译过程中断，直接重新运行 `npm run i18n`，脚本会基于已保存的进度继续。

### 翻译失败批次

失败的批次会保存在 `{outputname}-failed-batches.json`，包含详细错误信息。

### JSON 格式错误

错误：`Unexpected token` 或解析失败

解决：
1. 检查源文件 `en.json` 是否为有效 JSON
2. 使用在线工具如 [JSONLint](https://jsonlint.com/) 验证格式

## 注意事项

- **API 费用**：大量翻译会产生 OpenRouter API 费用，建议先小批量测试
- **密钥安全**：不要将 API 密钥提交到 Git 仓库（建议使用环境变量）
- **备份源文件**：翻译前备份原始文件，避免意外覆盖
- **网络稳定性**：确保网络连接稳定，或适当增加重试次数

## 许可证

MIT License
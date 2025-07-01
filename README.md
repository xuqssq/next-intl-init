

# AI-Powered i18n Translation Script

一个基于 AI 的自动化国际化翻译工具，支持批量翻译 JSON 格式的语言文件，保持原始文件结构和键值完整性。

## 功能特点

- 🤖 **AI 智能翻译**：支持 OpenRouter 和 Google Gemini 模型
- 📦 **批量处理**：可配置批次大小和并行数量，提高翻译效率
- 🔄 **自动重试**：内置重试机制，确保翻译稳定性
- 🛡️ **结构保护**：严格保持 JSON 结构和键名不变
- ✅ **完整性验证**：提供验证脚本检查翻译结果
- ⚡ **并行翻译**：支持多语言同时翻译
- 📊 **进度跟踪**：实时保存翻译进度，支持断点续传

## 安装

1. 运行初始化脚本：
```bash
npx next-intl-init
```

2. 安装必要的依赖：
```bash
yarn add ai @ai-sdk/google @openrouter/ai-sdk-provider zod
```

## 配置

### 1. 配置 API 密钥

编辑 `scripts/constants.mjs` 文件，在 `scripts/translate.mjs` 中配置您的 API 密钥：

```javascript
// OpenRouter (推荐)
const OPEN_ROUTER_KEY = "your-openrouter-api-key";

// 或者使用 Google Gemini
const GEMINI_API_KEY = "your-gemini-api-key";
```

### 2. 配置翻译参数

在 `scripts/constants.mjs` 中调整翻译配置：

```javascript
export const ORIGINAL_JSON = "src/i18n/messages/en.json"; // 源文件路径
export const TRANSLATED_DIR = "src/i18n/messages";        // 输出目录
export const INPUT_COUNT = 100;                           // 每批翻译条数
export const PARALLEL_BATCHES = 10;                       // 并行批次数
export const MAX_RETRIES = 5;                            // 最大重试次数
export const RETRY_DELAY = 3000;                         // 重试延迟(毫秒)
```

### 3. 配置目标语言

修改 `OUTPUT_LIST` 数组添加需要翻译的语言：

```javascript
export const OUTPUT_LIST = [
  {
    language: "中文-zh",
    outputname: "zh.json",
  },
  {
    language: "日语-ja", 
    outputname: "ja.json",
  },
  {
    language: "韩语-ko",
    outputname: "ko.json",
  },
  // 添加更多语言...
];
```

## 使用方法

### 1. 准备源文件

确保您的英文语言文件（默认：`src/i18n/messages/en.json`）格式正确：

```json
{
  "data": {
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
}
```

### 2. 开始翻译

```bash
npm run i18n
```

### 3. 验证翻译结果

```bash
npm run i18n_verify
```

## 文件结构

```
your-project/
├── scripts/
│   ├── constants.mjs      # 配置文件
│   ├── translate.mjs      # 翻译脚本
│   └── verify_key.mjs     # 验证脚本
├── src/
│   └── i18n/
│       └── messages/
│           ├── en.json    # 源文件
│           ├── zh.json    # 中文翻译
│           ├── ja.json    # 日文翻译
│           └── ko.json    # 韩文翻译
└── package.json
```

## 高级配置

### 模型选择

#### OpenRouter (推荐)

```javascript
const openrouter = createOpenRouter({
  apiKey: OPEN_ROUTER_KEY,
});
const model = openrouter("openai/gpt-4o-mini");
```

#### Google Gemini

```javascript
const google = createGoogleGenerativeAI({ 
  apiKey: GEMINI_API_KEY 
});
const model = google("gemini-2.5-flash");
```

### 性能优化

- **减少并行批次数**：如果遇到 API 限频，降低 `PARALLEL_BATCHES` 值
- **调整批次大小**：根据内容复杂度调整 `INPUT_COUNT`
- **增加重试延迟**：网络不稳定时增加 `RETRY_DELAY`

## 故障排除

### 常见问题

1. **API 限频错误**
   - 降低 `PARALLEL_BATCHES` 值
   - 增加 `RETRY_DELAY` 时间

2. **翻译结果不完整**
   - 运行 `npm run i18n_verify` 检查缺失的键
   - 检查源文件 JSON 格式是否正确

3. **内存不足**
   - 减少 `INPUT_COUNT` 批次大小
   - 降低并行处理数量

### 日志分析

脚本会输出详细的翻译进度和错误信息：

```
准备翻译 10 个批次，每批次 100 条数据
并行处理 5 批次，最大重试次数 5

开始翻译：中文-zh
开始翻译 中文-zh: 第1批数据
完成翻译 中文-zh: 第1批数据
...
✅ 中文-zh 翻译完成，耗时: 45.32秒
```

## 贡献

欢迎提交 Issue 和 Pull Request 来改进这个工具。

## 许可证

MIT License

## 注意事项

- 请确保 API 密钥安全，不要提交到版本控制
- 大量翻译可能产生 API 费用，请注意成本控制
- 建议先用小批次测试翻译效果
- 定期备份重要的翻译文件
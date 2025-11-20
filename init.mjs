#!/usr/bin/env node

import fs from "fs";
import path from "path";

const scriptsDir = path.join(process.cwd(), "scripts/i18n");
if (!fs.existsSync(scriptsDir)) {
  fs.mkdirSync(scriptsDir, { recursive: true });
}

const constantsPath = path.join(scriptsDir, "constants.mjs");
const initConstants = () => {
  const content = `
import path from "path";

export const OPEN_ROUTER_KEY = ""; //OpenRouter API密钥
export const OPEN_ROUTER_MODEL = "openai/gpt-4o-mini"; //OpenRouter模型
export const ORIGINAL_JSON = path.resolve(process.cwd(), "src/i18n/messages/en.json"); //源文件
export const TRANSLATED_DIR = path.resolve(process.cwd(), "src/i18n/messages"); //翻译后存储的文件夹
export const INPUT_COUNT = 50; // 一批翻译多少条
export const PARALLEL_BATCHES = 10; // 并行处理的批次数量,需要翻译的语言多就改小
export const MAX_RETRIES = 5; // 最大重试次数
export const RETRY_DELAY = 3000; // 重试延迟时间 (毫秒)
//需要翻译的语言列表
export const OUTPUT_LIST = [
  {
    language: "中文-zh",
    outputname: "zh.json",
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
`;
  fs.writeFileSync(constantsPath, content);
};

const translatePath = path.join(scriptsDir, "translate.mjs");
const initTranslate = () => {
  const content = `
  import { generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import fs from "fs";
import path from "path";
import {
  ORIGINAL_JSON,
  TRANSLATED_DIR,
  INPUT_COUNT,
  PARALLEL_BATCHES,
  MAX_RETRIES,
  RETRY_DELAY,
  OUTPUT_LIST,
  OPEN_ROUTER_KEY,
  OPEN_ROUTER_MODEL,
} from "./constants.mjs";

const openrouter = createOpenRouter({
  apiKey: OPEN_ROUTER_KEY,
});
const model = openrouter(OPEN_ROUTER_MODEL);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 递归拍平JSON对象，将嵌套结构转换为路径-值对数组
 * @param {Object} obj - 要拍平的对象
 * @param {Array} parentPath - 父级路径数组
 * @returns {Array} 路径-值对数组 [{ path: ['a', 'b'], value: 'xxx' }, ...]
 */
const flattenJSON = (obj, parentPath = []) => {
  const result = [];

  for (const key in obj) {
    if (!obj.hasOwnProperty(key)) continue;

    const currentPath = [...parentPath, key];
    const value = obj[key];

    // 如果值是对象且不是null，递归处理
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result.push(...flattenJSON(value, currentPath));
    } else {
      // 叶子节点，保存路径和值
      result.push({
        path: currentPath,
        value: value
      });
    }
  }

  return result;
};

/**
 * 将拍平的路径-值对数组重建为嵌套JSON对象
 * @param {Array} flatArray - 路径-值对数组 [{ path: ['a', 'b'], value: 'xxx' }, ...]
 * @returns {Object} 重建的嵌套JSON对象
 */
const unflattenJSON = (flatArray) => {
  const result = {};

  for (const item of flatArray) {
    const { path, value } = item;
    let current = result;

    // 遍历路径，构建嵌套对象
    for (let i = 0; i < path.length - 1; i++) {
      const key = path[i];
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }

    // 设置最终的值
    const lastKey = path[path.length - 1];
    current[lastKey] = value;
  }

  return result;
};

/**
 * 将路径数组转换为字符串键（用于批次处理）
 * @param {Array} path - 路径数组
 * @returns {String} 路径字符串，如 "metadata.default.title"
 */
const pathToKey = (path) => path.join('.');

/**
 * 将字符串键转换回路径数组
 * @param {String} key - 路径字符串
 * @returns {Array} 路径数组
 */
const keyToPath = (key) => key.split('.');

const translateWithRetry = async (prompt, language, retries = MAX_RETRIES) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await generateText({
        model,
        system: \`
          You are a professional translation expert specialized in structured JSON data localization.
          Your core task: translate ONLY the values of the provided JSON object (the text inside quotation marks), according to the following rules:

          IMPORTANT RULES:
          1. Never remove or rename any key. Never add or delete any key. Every key in the input must exist in the output, even if its value is empty, null, or undefined.
          2. Always keep the structure, nesting, order, and formatting 100% identical to the input.
          3. ONLY translate JSON values which are plain text (e.g. English sentences). If the value is not a translatable string (empty, null, number, boolean), do NOT modify it.
          4. Output must be in raw plain JSON that can be directly parsed by JSON.parse() without any wrapper, markdown, or extra notes.
          5. If you find a key whose value is an empty string, null, or not a string, keep the value exactly as is, do NOT translate or change it.
          6. If the JSON contains empty object, empty array, or keys with only whitespace, keep them 100% identical.
          7. If the value contains curly braces like {ticker} or {name}, this is a placeholder variable; the content within the curly braces does not need to be translated.
          8. The keys may contain dots (.) which represent nested paths like "metadata.default.title" - these are just key names, do NOT interpret them as nested structures.
          9. Do not translate brand names.

          Strong Warning:
          - If you omit, lose, or duplicate any key, it will be considered a critical error.
          - You must guarantee key-value pairing is preserved, with NO missing keys.

          Sample input:
          {
            "metadata.default.title": "Hello {name}",
            "metadata.default.desc": "",
            "data.t1": "Value1",
            "data.t2": null,
            "data.t3": 100
          }

          Sample output (for target language: Chinese):
          {
            "metadata.default.title": "你好 {name}",
            "metadata.default.desc": "",
            "data.t1": "值1",
            "data.t2": null,
            "data.t3": 100
          }

          Repeat: Output only pure, standard, complete JSON which can be directly JSON.parse(). Absolutely do not add, remove, or alter any key. DO NOT translate any key or non-string value. Preserve all placeholder variables in curly braces {}.
        \`,
        prompt: \`
        You are a \${language} professional with extensive financial knowledge, and fluent in both English and \${language}. You need to translate English into fluent \${language}, including any financial terminology used in the English translation.
        Translate the following JSON into native \${language} for ALL string values only. Never lose any key or value. Only translate the values, keep all keys and non-string values unchanged and preserve all content within curly braces {}. Output pure JSON, directly parsable, nothing else:
        \${prompt}\`,
      });

      const cleanText = response.text
        .replace(/\`\`\`json/g, "")
        .replace(/\`\`\`/g, "");
      return JSON.parse(cleanText);
    } catch (error) {
      console.error(\`翻译失败 (尝试 \${attempt}/\${retries}): \${
    error.message
  }\`);

      if (attempt === retries) {
        throw new Error(\`翻译失败，已重试 \${retries} 次: \${error.message}\`);
      }

      // 指数退避重试
      await delay(RETRY_DELAY * attempt);
    }
  }
};

const processBatchesInParallel = async (batches, language, outputPath) => {
  const translatedItems = []; // 存储翻译后的路径-值对
  const failedBatches = [];
  const totalBatches = batches.length;

  // 将批次分组进行并行处理
  for (let i = 0; i < totalBatches; i += PARALLEL_BATCHES) {
    const currentBatches = batches.slice(i, i + PARALLEL_BATCHES);
    const batchPromises = currentBatches.map(async (batch, index) => {
      const actualIndex = i + index;
      const { batchIndex, totalBatches: batchTotal, itemCount, items } = batch;

      try {
        const progress = ((actualIndex + 1) / totalBatches * 100).toFixed(1);
        console.log(
          \`[\${language}] 批次 \${batchIndex + 1}/\${batchTotal} \` +
          \`(\${itemCount} 项) | 总进度 \${
    actualIndex + 1
  }/\${totalBatches} (\${progress}%)\`
        );

        // 将路径-值对转换为临时对象用于翻译
        const batchObject = {};
        items.forEach(item => {
          const key = pathToKey(item.path);
          batchObject[key] = item.value;
        });

        const prompt = JSON.stringify(batchObject);
        const translatedObject = await translateWithRetry(prompt, language);

        // 将翻译结果转回路径-值对
        const translatedBatchItems = items.map(item => {
          const key = pathToKey(item.path);
          return {
            path: item.path,
            value: translatedObject[key]
          };
        });

        console.log(
          \`✅ [\${language}] 批次 \${batchIndex + 1}/\${batchTotal} 完成\`
        );

        return {
          index: actualIndex,
          items: translatedBatchItems,
          success: true
        };
      } catch (error) {
        console.error(
          \`❌ [\${language}] 批次 \${batchIndex + 1}/\${batchTotal} 失败:\`,
          error.message
        );

        return {
          index: actualIndex,
          batchIndex,
          items: null,
          error: error.message,
          success: false,
          originalBatch: batch
        };
      }
    });

    // 等待当前组的所有批次完成
    const batchResults = await Promise.all(batchPromises);

    // 合并结果并记录失败批次
    batchResults.forEach((result) => {
      if (result.success && result.items) {
        translatedItems.push(...result.items);
      } else {
        failedBatches.push({
          index: result.index,
          batchIndex: result.batchIndex,
          error: result.error,
          batch: result.originalBatch
        });
        console.error(
          \`⚠️  批次 \${result.index + 1} 翻译失败: \${result.error}\`
        );
      }
    });

    // 实时保存进度 - 重建嵌套结构
    const rebuiltJSON = unflattenJSON(translatedItems);
    fs.writeFileSync(outputPath, JSON.stringify(rebuiltJSON, null, 2));

    const completedBatches = Math.min(i + PARALLEL_BATCHES, totalBatches);
    const overallProgress = ((completedBatches / totalBatches) * 100).toFixed(1);

    console.log(
      \`\n📊 \${language} 进度: \${completedBatches}/\${totalBatches} 批次 (\${overallProgress}%) | \` +
      \`已翻译: \${translatedItems.length} 项 | 失败: \${failedBatches.length}\n\`
    );

    // 如果不是最后一组，稍微延迟一下避免API限制
    if (i + PARALLEL_BATCHES < totalBatches) {
      await delay(500);
    }
  }

  // 保存失败批次信息
  if (failedBatches.length > 0) {
    const failedBatchesPath = outputPath.replace('.json', '-failed-batches.json');
    fs.writeFileSync(
      failedBatchesPath,
      JSON.stringify(failedBatches, null, 2)
    );
    console.log(\`⚠️  失败批次已保存至: \${failedBatchesPath}\`);
  }

  return unflattenJSON(translatedItems);
};

const prepareBatches = (flattenedItems) => {
  const batches = [];
  const totalBatches = Math.ceil(flattenedItems.length / INPUT_COUNT);

  for (let i = 0; i < flattenedItems.length; i += INPUT_COUNT) {
    const batchItems = flattenedItems.slice(i, i + INPUT_COUNT);
    batches.push({
      batchIndex: Math.floor(i / INPUT_COUNT),
      totalBatches: totalBatches,
      itemCount: batchItems.length,
      items: batchItems
    });
  }

  return batches;
};

const start = async () => {
  // 确保输出目录存在
  if (!fs.existsSync(TRANSLATED_DIR)) {
    fs.mkdirSync(TRANSLATED_DIR, { recursive: true });
  }

  try {
    // 读取原始数据
    const originalJson = fs.readFileSync(ORIGINAL_JSON, "utf-8");
    const originalData = JSON.parse(originalJson);

    // 拍平JSON
    console.log('🔄 正在拍平JSON结构...\');
    const flattenedItems = flattenJSON(originalData);
    console.log(\`✅ 拍平完成，共 \${flattenedItems.length} 个条目\n\`);

    // 准备批次
    const batches = prepareBatches(flattenedItems);

    console.log('========== 翻译配置 ==========');
    console.log(\`📦 JSON条目总数: \${flattenedItems.length} 项\`);
    console.log(\`📦 批次总数: \${batches.length} (每批 \${INPUT_COUNT} 条)\`);
    console.log(\`⚙️  并行批次: \${PARALLEL_BATCHES} | 最大重试: \${MAX_RETRIES}\`);
    console.log(\`🌍 目标语言: \${OUTPUT_LIST.map((l) => l.language).join(
      ", "
    )}\`);
    console.log('================================');

    // 并行处理所有语言
    const languagePromises = OUTPUT_LIST.map(
      async ({ language, outputname }) => {
        try {
          console.log(\`🚀 开始翻译：\${language}\`);
          const outputPath = path.join(TRANSLATED_DIR, outputname);

          const startTime = Date.now();
          await processBatchesInParallel(batches, language, outputPath);
          const endTime = Date.now();

          console.log(
            \`\n✅ \${language} 翻译完成，耗时: \${(
    (endTime - startTime) /
    1000
  ).toFixed(2)}秒\n\`,
          );
          return { language, success: true };
        } catch (error) {
          console.error(\`\n❌ \${language} 翻译失败:\${error.message}\n\`);
          return { language, success: false, error: error.message };
        }
      },
    );

    // 等待所有语言翻译完成
    const results = await Promise.all(languagePromises);

    // 输出结果摘要
    console.log("========== 翻译结果摘要 ==========\");
    results.forEach(({ language, success, error }) => {
      if (success) {
        console.log(\`✅ \${language}: 成功\`);
      } else {
        console.log(\`❌ \${language}: 失败 - \${error}\`);
      }
    });

    const successCount = results.filter((r) => r.success).length;
    console.log(\`\n翻译结束🎉 成功: \${successCount}/\${
    results.length
  } 种语言\`);
  } catch (error) {
    console.error("翻译过程中发生错误:", error);
  }
};

start();
    `;
  fs.writeFileSync(translatePath, content);
};

const verifyKeyPath = path.join(scriptsDir, "verify_key.mjs");
const initVerifyKey = () => {
  const content = `
import fs from "fs";
import path from "path";
import { OUTPUT_LIST, ORIGINAL_JSON, TRANSLATED_DIR } from "./constants.mjs";

// 递归获取所有 key 的路径
function getAllKeyPaths(obj, prefix = "") {
  let paths = [];
  for (const key in obj) {
    const value = obj[key];
    const nextPrefix = prefix ? prefix + "." + key : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      paths = paths.concat(getAllKeyPaths(value, nextPrefix));
    } else {
      paths.push(nextPrefix);
    }
  }
  return paths;
}

// 读取 JSON 文件
function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (e) {
    return {};
  }
}

const main = () => {
  const originalObj = loadJson(ORIGINAL_JSON);
  const originalKeys = getAllKeyPaths(originalObj);
  OUTPUT_LIST.forEach(({ outputname, language }) => {
    const translatedPath = path.join(TRANSLATED_DIR, outputname);
    const translatedObj = loadJson(translatedPath);
    const translatedKeys = getAllKeyPaths(translatedObj);
    const missingKeys = originalKeys.filter((k) => !translatedKeys.includes(k));
    const extraKeys = translatedKeys.filter((k) => !originalKeys.includes(k));
    console.log('\\n[' + language + '] ' + outputname + ' 检查结果:');
    if (missingKeys.length) {
      console.log(
        '  缺失 key (' + missingKeys.length + '):\\n   - ' + missingKeys.join('\\n   - ')
      );
    } else {
      console.log('  没有缺失 key。');
    }
    if (extraKeys.length) {
      console.log(
        '  多余 key (' + extraKeys.length + '):\\n   - ' + extraKeys.join('\\n   - ')
      );
    } else {
      console.log('  没有多余 key。');
    }
  });
};

main();
  `;
  fs.writeFileSync(verifyKeyPath, content);
};

const initPackageJson = () => {
  const packageJsonPath = path.join(process.cwd(), "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  packageJson.scripts.i18n = "node scripts/i18n/translate.mjs";
  packageJson.scripts.i18n_verify = "node scripts/i18n/verify_key.mjs";
  packageJson.dependencies["@openrouter/ai-sdk-provider"] = "^1.2.3";
  packageJson.dependencies["ai"] = "^5.0.93";
  packageJson.dependencies["zod"] = "^4.1.12";
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
};

const main = () => {
  try {
    initConstants();
    initTranslate();
    initVerifyKey();
    initPackageJson();
    console.log("初始化完成🎉🎉🎉");
  } catch (error) {
    console.error("初始化失败❌❌❌", error);
  }
};

main();

#!/usr/bin/env node

import fs from "fs";
import path from "path";

const scriptsDir = path.join(process.cwd(), "scripts");
if (!fs.existsSync(scriptsDir)) {
  fs.mkdirSync(scriptsDir);
}

const constantsPath = path.join(scriptsDir, "constants.mjs");
const initConstants = () => {
  const content = `
import path from "path";

export const ORIGINAL_JSON = path.resolve(process.cwd(), "src/i18n/messages/en.json"); //源文件
export const TRANSLATED_DIR = path.resolve(process.cwd(), "src/i18n/messages"); //翻译后存储的文件夹
export const INPUT_COUNT = 100; // 一批翻译多少条
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
    language: "日语-ja",
    outputname: "ja.json",
  },
  {
    language: "韩语-ko",
    outputname: "ko.json",
  },
];`;
  fs.writeFileSync(constantsPath, content);
};

const translatePath = path.join(scriptsDir, "translate.mjs");
const initTranslate = () => {
  const content = `
  import { generateText } from "ai";
  import { createGoogleGenerativeAI } from "@ai-sdk/google";
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
  } from "./constants.mjs";

  // gemini 免费模型(效果不好，限频)
  // const GEMINI_API_KEY = "";
  // const google = createGoogleGenerativeAI({ apiKey: GEMINI_API_KEY });
  // const model = google("gemini-2.5-flash");

  // openrouter
  const OPEN_ROUTER_KEY ="";
  const openrouter = createOpenRouter({
    apiKey: OPEN_ROUTER_KEY,
  });
  const model = openrouter("openai/gpt-4o-mini");

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
            Strong Warning:
            - If you omit, lose, or duplicate any key, it will be considered a critical error.
            - You must guarantee key-value pairing is preserved, with NO missing keys.
            Sample input:
            {
              "title": "Hello",
              "desc": "",
              "data": {
                "k1": "Value1",
                "k3": 0,
                "k4": "Welcome",
                "k2": null
              }
            }
            Sample output (for target language: Chinese):
            {
              "title": "你好",
              "desc": "",
              "data": {
                "k1": "值1",
                "k3": 0,
                "k4": "欢迎",
                "k2": null
              }
            }
            Repeat: Output only pure, standard, complete JSON which can be directly JSON.parse(). Absolutely do not add, remove, or alter any key, bracket, or structure. DO NOT translate any key or non-string value.
            If you find your model has missed any key/structure, reprocess and return a corrected version.
          \`,
          prompt: \`Translate the following JSON into native \${language} for ALL string values only. Never lose any key or value. Only translate the values, keep all keys and non-string values unchanged. Output pure JSON, directly parsable, nothing else:
  \${prompt}
  \`,
        });
        const cleanText = response.text
          .replace(/\\\`\\\`\\\`json/g, "")
          .replace(/\\\`\\\`\\\`/g, "");
        return JSON.parse(cleanText);
      } catch (error) {
        console.error(\`翻译失败 (尝试 \${attempt}/\${retries}): \${error.message}\`);
        if (attempt === retries) {
          throw new Error(\`翻译失败，已重试 \${retries} 次: \${error.message}\`);
        }
        // 等待一段时间再重试
        await delay(RETRY_DELAY * attempt);
      }
    }
  };
  const processBatchesInParallel = async (batches, language, outputPath) => {
    const results = {};
    const totalBatches = batches.length;
    // 将批次分组进行并行处理
    for (let i = 0; i < totalBatches; i += PARALLEL_BATCHES) {
      const currentBatches = batches.slice(i, i + PARALLEL_BATCHES);
      const batchPromises = currentBatches.map(async (batch, index) => {
        const actualIndex = i + index;
        try {
          console.log(\`开始翻译 \${language}: 第\${actualIndex + 1}批数据\`);
          const prompt = JSON.stringify(batch);
          const result = await translateWithRetry(prompt, language);
          console.log(\`完成翻译 \${language}: 第\${actualIndex + 1}批数据\`);
          return { index: actualIndex, data: result.data };
        } catch (error) {
          console.error(
            \`翻译 \${language} 第\${actualIndex + 1}批数据失败:\`,
            error.message
          );
          return { index: actualIndex, data: null, error: error.message };
        }
      });
      // 等待当前组的所有批次完成
      const batchResults = await Promise.all(batchPromises);
      // 合并结果
      batchResults.forEach(({ index, data, error }) => {
        if (data) {
          Object.assign(results, data);
        } else {
          console.error(\`批次 \${index + 1} 翻译失败: \${error}\`);
        }
      });
      // 实时保存进度
      const outputData = { data: results };
      fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
      console.log(
        \`\${language} 已完成 \${Math.min(
          i + PARALLEL_BATCHES,
          totalBatches
        )}/\${totalBatches} 批次\`
      );
      // 如果不是最后一组，稍微延迟一下避免API限制
      if (i + PARALLEL_BATCHES < totalBatches) {
        await delay(500);
      }
    }
    return results;
  };
  const prepareBatches = (originalData) => {
    const keys = Object.keys(originalData.data);
    const batches = [];
    for (let i = 0; i < keys.length; i += INPUT_COUNT) {
      const batchData = {};
      keys.slice(i, i + INPUT_COUNT).forEach((key) => {
        batchData[key] = originalData.data[key];
      });
      batches.push({ data: batchData });
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
      const batches = prepareBatches(originalData);
      console.log(
        \`准备翻译 \${batches.length} 个批次，每批次 \${INPUT_COUNT} 条数据\`
      );
      console.log(
        \`并行处理 \${PARALLEL_BATCHES} 批次，最大重试次数 \${MAX_RETRIES}\`
      );
      // 并行处理所有语言
      const languagePromises = OUTPUT_LIST.map(
        async ({ language, outputname }) => {
          try {
            console.log(\`\\n开始翻译：\${language}\`);
            const outputPath = path.join(TRANSLATED_DIR, outputname);
            const startTime = Date.now();
            await processBatchesInParallel(batches, language, outputPath);
            const endTime = Date.now();
            console.log(
              \`✅ \${language} 翻译完成，耗时: \${(
                (endTime - startTime) /
                1000
              ).toFixed(2)}秒\`
            );
            return { language, success: true };
          } catch (error) {
            console.error(\`❌ \${language} 翻译失败:\`, error.message);
            return { language, success: false, error: error.message };
          }
        }
      );
      // 等待所有语言翻译完成
      const results = await Promise.all(languagePromises);
      // 输出结果摘要
      console.log("\\n========== 翻译结果摘要 ==========");
      results.forEach(({ language, success, error }) => {
        if (success) {
          console.log(\`✅ \${language}: 成功\`);
        } else {
          console.log(\`❌ \${language}: 失败 - \${error}\`);
        }
      });
      const successCount = results.filter((r) => r.success).length;
      console.log(\`\\n翻译结束🎉 成功: \${successCount}/\${results.length} 种语言\`);
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
  packageJson.scripts.i18n = "node scripts/translate.mjs";
  packageJson.scripts.i18n_verify = "node scripts/verify_key.mjs";
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

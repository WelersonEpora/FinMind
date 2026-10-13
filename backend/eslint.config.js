"use strict";

module.exports = [
  {
    ignores: ["node_modules/**"]
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        require: "readonly",
        module: "readonly",
        process: "readonly",
        console: "readonly",
        __dirname: "readonly",
        fetch: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        AbortController: "readonly",
        AbortSignal: "readonly",
        structuredClone: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      "no-undef": "error"
    }
  },
  // Carteiras virtuais (ADR 0127): o domínio é puro (só os próprios módulos e o Node: nada de banco, serviço, rede nem
  // corretora), e os módulos de mercado não dependem dele (ADR 0007, §6: o mercado nunca recebe dado de espaço).
  {
    files: ["src/carteiras/**/*.js"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='require'][arguments.0.value!=/^(\\.\\/|node:)/]",
          message: "O domínio das carteiras é puro: só importa os próprios módulos e o Node (ADR 0127)."
        }
      ]
    }
  },
  {
    files: ["src/collectors/**/*.js", "src/factors/**/*.js", "src/analytics-engine/**/*.js"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='require'][arguments.0.value=/carteiras/]",
          message: "Módulo de mercado não depende das carteiras (dado de espaço; ADRs 0007 e 0127)."
        }
      ]
    }
  }
];

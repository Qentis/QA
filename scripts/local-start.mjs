import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function getLanIp() {
  const nets = os.networkInterfaces();
  for (const list of Object.values(nets)) {
    if (!list) continue;
    for (const net of list) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return null;
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const result = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

function upsertEnvVar(filePath, key, value) {
  let content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const escaped = value.replace(/"/g, '\\"');
  const line = `${key}="${escaped}"`;
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    content = content.replace(regex, line);
  } else {
    content = content ? `${content.trimEnd()}\n${line}\n` : `${line}\n`;
  }
  fs.writeFileSync(filePath, content, 'utf8');
}

async function main() {
  process.chdir(rootDir);

  const nodeModulesDir = path.join(rootDir, 'node_modules');
  const tsxBin = path.join(
    nodeModulesDir,
    '.bin',
    process.platform === 'win32' ? 'tsx.cmd' : 'tsx'
  );

  if (!fs.existsSync(nodeModulesDir) || !fs.existsSync(tsxBin)) {
    console.log('\n[1/3] Установка зависимостей (npm install)...');
    const install = spawnSync(npmCmd, ['install'], {
      cwd: rootDir,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    if (install.status !== 0) {
      console.error('Ошибка при установке зависимостей.');
      process.exit(install.status ?? 1);
    }
  } else {
    console.log('\n[1/3] Зависимости уже установлены.');
  }

  const envPath = path.join(rootDir, '.env');
  const envExamplePath = path.join(rootDir, '.env.example');
  if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envPath);
  }

  const envVars = readEnvFile(envPath);
  const currentKey = process.env.GEMINI_API_KEY || envVars.GEMINI_API_KEY || '';
  const hasRealKey = Boolean(currentKey && currentKey !== 'MY_GEMINI_API_KEY');

  if (!hasRealKey) {
    if (process.stdin.isTTY) {
      console.log('\n[2/3] Требуется GEMINI_API_KEY для генерации баг-репортов.');
      console.log('Получить ключ можно в Google AI Studio: https://aistudio.google.com/apikey');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      const entered = (
        await rl.question('Вставьте GEMINI_API_KEY (или Enter чтобы пропустить пока): ')
      ).trim();
      rl.close();

      if (entered) {
        upsertEnvVar(envPath, 'GEMINI_API_KEY', entered);
        console.log('Ключ сохранён в .env');
      } else {
        console.log('Пропущено. Вы сможете указать GEMINI_API_KEY позже в файле .env.');
      }
    } else {
      console.warn(
        '\n[2/3] Внимание: GEMINI_API_KEY не задан. Укажите его в .env или через переменную окружения.'
      );
    }
  } else {
    console.log('[2/3] GEMINI_API_KEY найден.');
  }

  const port = process.env.PORT || '3000';
  const lanIp = getLanIp();

  console.log('\n[3/3] Запуск QA BugSnap...');
  console.log(`  Локально:      http://localhost:${port}`);
  if (lanIp) {
    console.log(`  На телефоне:   http://${lanIp}:${port} (в той же Wi-Fi сети)`);
  }
  console.log('  Остановка:     Ctrl+C\n');

  const child = spawn(npmCmd, ['run', 'dev'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  const forwardSignal = (signal) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };
  process.on('SIGINT', () => forwardSignal('SIGINT'));
  process.on('SIGTERM', () => forwardSignal('SIGTERM'));

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error('Ошибка запуска:', err);
  process.exit(1);
});

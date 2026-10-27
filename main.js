import { Command } from "commander";
import fs from "node:fs";

const program = new Command();

program
  .helpOption("--help", "показати довідку") // -h потрібен для --host
  .requiredOption("-i, --input <path>", "шлях до файлу з даними")
  .requiredOption("-h, --host <address>", "адреса сервера")
  .requiredOption("-p, --port <number>", "порт сервера")
  .option("-o, --output <path>", "файл, у який записується остання відповідь");

program.parse();
const options = program.opts();

// Порт приходить рядком, тому перетворюємо його в число і перевіряємо
const port = Number(options.port);
if (options.port.trim() === "" || !Number.isInteger(port) || port < 0 || port > 65535) {
  console.error("Помилка: порт має бути цілим числом від 0 до 65535");
  process.exit(1);
}

// Перевірка, що вхідний файл існує
fs.access(options.input, (error) => {
  if (error) {
    console.error("Cannot find input file");
    process.exit(1);
  }
  console.log("Параметри правильні, файл знайдено");
});
import { Command } from "commander";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

// Значення зі статусом з умови завдання (з файлу воно не береться)
const FURNISHED = "furnished";

// ---------- 1. Параметри командного рядка ----------
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

// Щоб випадково не затерти файл з даними
if (options.output !== undefined && path.resolve(options.output) === path.resolve(options.input)) {
  console.error("Помилка: файл --output не може збігатися з файлом --input");
  process.exit(1);
}

// ---------- 2. Перевірка, що вхідний файл існує ----------
fs.access(options.input, (error) => {
  if (error) {
    console.error("Cannot find input file");
    process.exit(1);
  }
  startServer();
});

// ---------- 3. Запуск сервера ----------
function startServer() {
  const server = http.createServer(handleRequest);

  server.on("error", (error) => {
    console.error("Помилка сервера: " + error.message);
    process.exit(1);
  });

  server.listen(port, options.host, () => {
    console.log("Сервер запущено: http://" + options.host + ":" + port + "/");
  });
}

// ---------- 4. Обробка одного запиту ----------
function handleRequest(req, res) {
  // Розбираємо адресу запиту на шлях і параметри
  if (!URL.canParse(req.url, "http://localhost")) {
    sendJson(res, 400, { error: "Некоректна адреса запиту" });
    return;
  }
  const url = new URL(req.url, "http://localhost");

  // Дані віддаємо тільки за маршрутом /
  if (url.pathname !== "/") {
    sendJson(res, 404, { error: "Маршрут не знайдено" });
    return;
  }

  // Прапорець: увімкнений, тільки якщо рівно furnished=true
  const furnishedOnly = url.searchParams.get("furnished") === "true";

  // Числовий параметр: якщо не число, відповідаємо 400
  let maxPrice = null;
  const maxPriceText = url.searchParams.get("max_price");
  if (maxPriceText !== null) {
    maxPrice = Number(maxPriceText);
    if (maxPriceText.trim() === "" || !Number.isFinite(maxPrice)) {
      sendJson(res, 400, { error: "Параметр max_price має бути числом" });
      return;
    }
  }

  // Читаємо файл з даними (колбек викличеться, коли файл буде прочитаний)
  fs.readFile(options.input, "utf-8", (error, text) => {
    if (error) {
      sendJson(res, 500, { error: "Не вдалося прочитати файл з даними" });
      return;
    }

    const houses = parseLines(text);
    if (houses === null) {
      sendJson(res, 500, { error: "Файл з даними пошкоджений" });
      return;
    }

    const result = [];
    for (const house of houses) {
      const price = toNumber(house.price);
      const area = toNumber(house.area);
      const status = house.furnishingstatus === undefined ? null : house.furnishingstatus;

      if (furnishedOnly && status !== FURNISHED) {
        continue;
      }
      if (maxPrice !== null && (price === null || price >= maxPrice)) {
        continue;
      }

      result.push({ price: price, area: area, furnishingstatus: status });
    }

    sendJson(res, 200, result);
  });
}

// ---------- 5. Допоміжні функції ----------

// Файл NDJSON: у кожному рядку окремий JSON-об'єкт
function parseLines(text) {
  const records = [];
  const lines = text.split("\n");

  for (const line of lines) {
    const cleanLine = line.trim();
    if (cleanLine === "") {
      continue; // порожні рядки пропускаємо
    }

    let record;
    try {
      record = JSON.parse(cleanLine);
    } catch (error) {
      return null; // рядок не є коректним JSON
    }

    // Запис має бути об'єктом (не число, не null, не масив)
    if (typeof record !== "object" || record === null || Array.isArray(record)) {
      return null;
    }
    records.push(record);
  }

  return records;
}

// Перетворює значення (наприклад "7420") на число; якщо не вийшло, повертає null
function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const number = Number(value);
    if (Number.isFinite(number)) {
      return number;
    }
  }
  return null;
}

// Надсилає відповідь; якщо є --output, спершу записує її у файл
function sendJson(res, status, data) {
  const body = JSON.stringify(data, null, 2);

  if (options.output === undefined) {
    finishResponse(res, status, body);
    return;
  }

  fs.writeFile(options.output, body, (error) => {
    if (error) {
      const errorBody = JSON.stringify({ error: "Не вдалося записати відповідь у файл" }, null, 2);
      finishResponse(res, 500, errorBody);
      return;
    }
    finishResponse(res, status, body);
  });
}

function finishResponse(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}
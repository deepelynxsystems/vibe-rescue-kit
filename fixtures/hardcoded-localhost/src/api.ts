export const api = "http://localhost:3000";

export async function load() {
  return fetch("http://127.0.0.1:3000/api/items");
}

export const supa = "http://localhost:54321";

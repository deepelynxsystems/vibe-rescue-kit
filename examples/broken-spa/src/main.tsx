import { format } from "date-fns";
import { BrowserRouter } from "react-router-dom";
import { Button } from "./components/button";

const serviceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UifQ.signature1";
const api = "http://localhost:3000";

export function boot() {
  console.log(format(new Date(), "yyyy-MM-dd"), serviceKey, api, BrowserRouter, Button);
}

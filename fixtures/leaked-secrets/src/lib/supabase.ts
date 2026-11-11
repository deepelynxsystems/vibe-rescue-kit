import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  "https://abc.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UifQ.signature1"
);

export const stripeSecret = "sk_test_1234567890abcdefghij";
export const anon = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIn0.signature1";
export const publishable = "pk_test_1234567890abcdefghij";

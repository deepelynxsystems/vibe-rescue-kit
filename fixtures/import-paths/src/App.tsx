import { format } from "date-fns";
import { Button } from "./components/button";
import { safe } from "@/lib/safe";
import fs from "fs";
import path from "node:path";
import React from "react";

export const label = format(new Date(), "yyyy");
export const view = Button;
export const ok = safe;
void fs;
void path;
void React;

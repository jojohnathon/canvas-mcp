import { AxiosInstance } from "axios";
import { StudentTools } from "../studentTools.js";

export interface ToolContext {
  axios: AxiosInstance;
  studentTools: StudentTools;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  execute: (args: any, context: ToolContext) => Promise<any>;
}

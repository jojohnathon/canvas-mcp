import { Tool } from "./types.js";

export const getMyTodoItemsTool: Tool = {
  name: "get-my-todo-items",
  description: "Fetch the authenticated student's to-do list",
  inputSchema: { type: "object", properties: {}, required: [] },
  execute: async (_args, { studentTools }) => {
    return studentTools.getMyTodoItems();
  }
};

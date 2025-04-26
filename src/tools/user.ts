import { AxiosInstance } from 'axios';
import { TodoItem } from '../types.js';

/**
 * Fetch the student's to-do list
 */
export async function getMyTodoItems(axiosInstance: AxiosInstance) {
  try {
    const response = await axiosInstance.get('/api/v1/users/self/todo');
    const todoItems: TodoItem[] = response.data;

    // Format the response for better readability and conciseness
    const formattedItemsText = todoItems.map(item => {
      let title = item.title || (item.assignment ? item.assignment.name : 'Untitled Item');
      // Use a shorter date format
      let dueDate = item.assignment?.due_at ? new Date(item.assignment.due_at).toLocaleDateString() : 'No due date';
      let type = item.type || 'Unknown';
      let course = item.context_name || 'Unknown Course';

      // Concise format: "- Title (Course) - Due: DueDate [Type]"
      return `- ${title} (${course}) - Due: ${dueDate} [${type}]`;

    }).join('\n'); // Join with newline

    const resultText = todoItems.length > 0
      ? `To-Do Items (Summary):\n\n${formattedItemsText}\n\n(Use 'getAssignmentDetails' or ask for more info on a specific item if needed)`
      : "No to-do items found.";

    return {
      content: [
        {
          type: "text",
          text: resultText,
        },
      ],
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to fetch to-do items: ${error.message}`);
    }
    throw new Error('Failed to fetch to-do items: Unknown error');
  }
}

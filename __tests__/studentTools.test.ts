import { StudentTools } from '../src/studentTools.js';

describe('StudentTools.getMyTodoItems', () => {
  it('formats todo items from API response', async () => {
    const tools = new StudentTools('https://example.com', 'token');
    (tools as any).axiosInstance = {
      get: jest.fn().mockResolvedValue({
        data: [
          {
            title: 'Read Chapter',
            type: 'assignment',
            context_name: 'History 101',
            html_url: 'http://example.com/todo/1',
            assignment: { points_possible: 5 }
          }
        ]
      })
    };

    const result = await tools.getMyTodoItems();
    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: 'To-Do Items:\n\nTitle: Read Chapter\nType: assignment\nCourse: History 101\nDue Date: No due date\nPoints: 5\nURL: http://example.com/todo/1\n---'
        }
      ]
    });
  });
});

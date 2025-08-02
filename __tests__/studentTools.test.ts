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
            assignment: { points_possible: 5 },
          },
        ],
      }),
    };

    const result = await tools.getMyTodoItems();
    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: 'To-Do Items:\n\nTitle: Read Chapter\nType: assignment\nCourse: History 101\nDue Date: No due date\nPoints: 5\nURL: http://example.com/todo/1\n---',
        },
      ],
    });
  });
});

describe('StudentTools.getUpcomingAssignments', () => {
  it('formats upcoming assignments from multiple courses', async () => {
    const tools = new StudentTools('https://example.com', 'token');
    const mockGet = jest
      .fn()
      .mockResolvedValueOnce({
        data: [
          { id: 1, name: 'Course A' },
          { id: 2, name: 'Course B' },
        ],
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: 101,
            name: 'Assignment 1',
            due_at: '2023-01-02T00:00:00Z',
            points_possible: 10,
            submission: { submitted_at: null, score: null },
            html_url: 'http://example.com/assign/101',
          },
        ],
      })
      .mockResolvedValueOnce({ data: [] });
    (tools as any).axiosInstance = { get: mockGet };

    const result = await tools.getUpcomingAssignments();
    expect(mockGet).toHaveBeenCalledTimes(3);
    expect(result.content[0].text).toContain('Upcoming Assignments');
    expect(result.content[0].text).toContain('Assignment: Assignment 1');
    expect(result.content[0].text).toContain('Course: Course A');
  });
});

describe('StudentTools.getCourseGrade', () => {
  it('formats course grade information', async () => {
    const tools = new StudentTools('https://example.com', 'token');
    const mockGet = jest
      .fn()
      .mockResolvedValueOnce({ data: { id: 42, name: 'Biology' } })
      .mockResolvedValueOnce({
        data: [
          {
            type: 'student',
            current_grade: '92%',
            current_score: 92,
            final_grade: 'A-',
            final_score: 90,
          },
        ],
      });
    (tools as any).axiosInstance = {
      get: mockGet,
      defaults: { baseURL: 'https://example.com' },
    };

    const result = await tools.getCourseGrade({ courseId: '42' });
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(result.content[0].text).toContain('Grade Information for Biology');
    expect(result.content[0].text).toContain('Current Grade: 92%');
    expect(result.content[0].text).toContain('Final Grade: A-');
  });
});

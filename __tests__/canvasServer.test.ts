import { CanvasServer } from '../src/canvasServer.js';

describe('CanvasServer.handleListCourses', () => {
  it('returns formatted list of available courses', async () => {
    const server = new CanvasServer({ apiToken: 'token', baseUrl: 'https://example.com' });
    (server as any).axiosInstance = {
      get: jest.fn().mockResolvedValue({
        data: [
          {
            id: 1,
            name: 'Course A',
            course_code: 'A101',
            term: { name: 'Fall' },
            workflow_state: 'available',
          },
          {
            id: 2,
            name: 'Course B',
            course_code: 'B202',
            term: { name: 'Winter' },
            workflow_state: 'completed',
          },
        ],
      }),
    };

    const result = await (server as any).handleListCourses();
    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: 'Available Courses:\n\nCourse: Course A (Fall)\nID: 1\nCode: A101\n---',
        },
      ],
    });
  });
});

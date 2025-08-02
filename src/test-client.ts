import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './config.js';

// Get directory of the current file
const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface ToolResponse {
  content: Array<{ type: string; text: string; }>;
}

class CanvasTestClient {
  private client: Client;
  private serverProcess: any;

  constructor() {
    // Initialize client with required parameters
    this.client = new Client(
      { name: 'CanvasTestClient', version: '1.0.0' },
      { capabilities: { tools: {}, resources: {}, prompts: {} } }
    );
  }

  async start() {
    // Start server process
    const serverPath = path.join(__dirname, 'index.js');
    this.serverProcess = spawn('node', [serverPath], {
      env: { ...process.env, CANVAS_API_TOKEN: config.apiToken, CANVAS_BASE_URL: config.baseUrl },
      stdio: ['pipe', 'pipe', 'inherit'], // redirect stdout to pipe, stderr to console
    });

    // Create transport connected to server process
    const transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath],
    });

    // Connect client to transport
    await this.client.connect(transport);

    console.log('Test client connected to server');
  }

  async stop() {
    if (this.serverProcess) {
      this.serverProcess.kill();
      console.log('Server process terminated');
    }
  }

  async listTools() {
    const response = await this.client.listTools();
    return response.tools;
  }

  async callTool(name: string, args: any = {}): Promise<ToolResponse> {
    console.log(`Calling tool: ${name} with args:`, JSON.stringify(args, null, 2));
    const start = Date.now();
    const response = await this.client.callTool({ name, arguments: args });
    const duration = Date.now() - start;
    console.log(`Tool call completed in ${duration}ms`);
    return response as ToolResponse;
  }

  async listCourses(): Promise<ToolResponse> {
    return this.callTool('list-courses');
  }

  async postAnnouncement(courseId: string, title: string, message: string): Promise<ToolResponse> {
    return this.callTool('post-announcement', { courseId, title, message });
  }

  async listRubrics(courseId: string): Promise<ToolResponse> {
    return this.callTool('list-rubrics', { courseId });
  }

  async listStudents(courseId: string, includeEmail: boolean = false): Promise<ToolResponse> {
    return this.callTool('list-students', { courseId, includeEmail });
  }

  async listAssignments(
    courseId: string,
    studentId?: string,
    includeSubmissionHistory: boolean = false
  ): Promise<ToolResponse> {
    return this.callTool('list-assignments', { courseId, studentId, includeSubmissionHistory });
  }

  async listAssignmentSubmissions(
    courseId: string,
    assignmentId: string,
    includeComments: boolean = true
  ): Promise<ToolResponse> {
    return this.callTool('list-assignment-submissions', {
      courseId,
      assignmentId,
      includeComments,
    });
  }

  async listSections(
    courseId: string,
    includeStudentCount: boolean = false
  ): Promise<ToolResponse> {
    return this.callTool('list-sections', { courseId, includeStudentCount });
  }

  async getRubricStatistics(
    courseId: string,
    assignmentId: string,
    includePointDistribution: boolean = true
  ): Promise<ToolResponse> {
    return this.callTool('get-rubric-statistics', {
      courseId,
      assignmentId,
      includePointDistribution,
    });
  }

  // Student tool methods
  async getMyTodoItems(): Promise<ToolResponse> {
    return this.callTool('get-my-todo-items');
  }

  async getUpcomingAssignments(): Promise<ToolResponse> {
    return this.callTool('get-upcoming-assignments');
  }

  async getCourseGrade(courseId: string): Promise<ToolResponse> {
    return this.callTool('get-course-grade', { courseId });
  }

  async getAssignmentDetails(courseId: string, assignmentId: string): Promise<ToolResponse> {
    return this.callTool('get-assignment-details', { courseId, assignmentId });
  }

  async getRecentAnnouncements(days: number = 14): Promise<ToolResponse> {
    return this.callTool('get-recent-announcements', { days });
  }

  async listCourseModules(courseId: string): Promise<ToolResponse> {
    return this.callTool('list-course-modules', { courseId });
  }

  async findCourseFiles(courseId: string, searchTerm: string): Promise<ToolResponse> {
    return this.callTool('find-course-files', { courseId, searchTerm });
  }

  async getUnreadDiscussions(courseId: string): Promise<ToolResponse> {
    return this.callTool('get-unread-discussions', { courseId });
  }

  async viewDiscussionTopic(courseId: string, topicId: string): Promise<ToolResponse> {
    return this.callTool('view-discussion-topic', { courseId, topicId });
  }

  async getMyQuizSubmission(courseId: string, quizId: string): Promise<ToolResponse> {
    return this.callTool('get-my-quiz-submission', { courseId, quizId });
  }

  async listPrompts() {
    const response = await this.client.listPrompts();
    return response.prompts;
  }

  async getPrompt(name: string, args: any = {}) {
    const response = await this.client.getPrompt({ name, arguments: args });
    return response.messages;
  }
}

// Example usage
async function runTests() {
  const client = new CanvasTestClient();

  try {
    await client.start();

    // List all available tools
    console.log('Available tools:');
    const tools = await client.listTools();
    console.log(tools.map(t => t.name).join(', '));

    // List courses
    console.log('\nFetching courses...');
    const coursesResponse = await client.listCourses();
    if (
      coursesResponse.content &&
      Array.isArray(coursesResponse.content) &&
      coursesResponse.content.length > 0 &&
      coursesResponse.content[0]?.text
    ) {
      console.log(coursesResponse.content[0].text);

      // Parse course ID from the output
      const courseIdMatch = coursesResponse.content[0].text.match(/ID: (\d+)/);
      if (courseIdMatch && courseIdMatch[1]) {
        const courseId = courseIdMatch[1];
        console.log(`\nUsing course ID: ${courseId}`);

        // List assignments for the course
        console.log('\nFetching assignments...');
        const assignmentsResponse = await client.listAssignments(courseId);
        if (
          assignmentsResponse.content &&
          Array.isArray(assignmentsResponse.content) &&
          assignmentsResponse.content.length > 0 &&
          assignmentsResponse.content[0]?.text
        ) {
          console.log(assignmentsResponse.content[0].text);
        }

        // List available prompts
        console.log('\nAvailable prompts:');
        const prompts = await client.listPrompts();
        console.log(prompts.map(p => p.name).join(', '));

        // Test a student tool
        console.log('\nTesting student tools - Getting todo items...');
        const todoResponse = await client.getMyTodoItems();
        if (
          todoResponse.content &&
          Array.isArray(todoResponse.content) &&
          todoResponse.content.length > 0 &&
          todoResponse.content[0]?.text
        ) {
          console.log(todoResponse.content[0].text);
        }
      }
    }
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await client.stop();
  }
}

// Run tests if executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runTests().catch(console.error);
}

export { CanvasTestClient };

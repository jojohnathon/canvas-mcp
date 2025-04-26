import 'dotenv/config';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  GetPromptResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosInstance } from 'axios';
import { CanvasConfig } from './types.js';
import { z } from 'zod';

// Import tool functions directly
import { getUpcomingAssignments, getAssignmentDetails } from './tools/assignments.js';
import { getRecentAnnouncements } from './tools/announcements.js';
import { getCourseGrade, findCourseFiles, listCoursePages, getPageContent, findOfficeHoursInfo } from './tools/courses.js';
import { getMyTodoItems } from './tools/user.js';
// Import functions from general.ts
import { listCourses, listRubrics, listAssignments, listSections } from './tools/general.js';
import { delay, fetchAllPages } from './utils.js';

class CanvasServer {
  private server: Server;
  private config: CanvasConfig;
  private axiosInstance: AxiosInstance;

  constructor(config: CanvasConfig) {
    this.config = config;

    this.server = new Server(
      {
        name: "canvas-mcp",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
          prompts: {},
        },
      }
    );

    this.axiosInstance = axios.create({
      baseURL: this.config.baseUrl,
      headers: {
        Authorization: `Bearer ${this.config.apiToken}`,
      },
    });

    this.setupRequestHandlers();
  }

  private setupRequestHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      console.error("Received ListToolsRequest");
      const toolsResponse = {
        tools: [
          {
            name: "list-courses",
            description: "List all active and available courses for the authenticated user",
            inputSchema: {
              type: "object",
              properties: {},
              required: [],
            },
          },
          {
            name: "list-rubrics",
            description: "List all rubrics for a specific course",
            inputSchema: {
              type: "object",
              properties: {
                courseId: {
                  type: "string",
                  description: "The ID of the course",
                },
              },
              required: ["courseId"],
            },
          },
          {
            name: "list-assignments",
            description: "List assignments for a specific course, optionally including submission details for a student",
            inputSchema: {
              type: "object",
              properties: {
                courseId: {
                  type: "string",
                  description: "The ID of the course",
                },
                studentId: {
                  type: "string",
                  description: "Optional: The ID of the student to get submission details for",
                },
                includeSubmissionHistory: {
                  type: "boolean",
                  description: "Optional: Include detailed submission history (default: false)",
                },
              },
              required: ["courseId"],
            },
          },
          {
            name: "list-sections",
            description: "List sections within a specific course, optionally including student count",
            inputSchema: {
              type: "object",
              properties: {
                courseId: {
                  type: "string",
                  description: "The ID of the course",
                },
                includeStudentCount: {
                  type: "boolean",
                  description: "Optional: Include the total number of students in each section (default: false)",
                },
              },
              required: ["courseId"],
            },
          },
          {
            name: "get-my-todo-items",
            description: "Fetch the authenticated student's to-do list",
            inputSchema: {
              type: "object",
              properties: {},
              required: [],
            },
          },
          {
            name: "get-upcoming-assignments",
            description: "Fetch upcoming assignments across all active courses for the student",
            inputSchema: {
              type: "object",
              properties: {},
              required: [],
            },
          },
          {
            name: "get-course-grade",
            description: "Fetch student's current overall grade in a specific course",
            inputSchema: {
              type: "object",
              properties: {
                courseId: {
                  type: "string",
                  description: "The ID of the course",
                },
              },
              required: ["courseId"],
            },
          },
          {
            name: "get-assignment-details",
            description: "Fetch details for a specific assignment including student's submission status",
            inputSchema: {
              type: "object",
              properties: {
                courseId: {
                  type: "string",
                  description: "The ID of the course",
                },
                assignmentId: {
                  type: "string",
                  description: "The ID of the assignment",
                },
              },
              required: ["courseId", "assignmentId"],
            },
          },
          {
            name: "get-recent-announcements",
            description: "Fetch recent announcements from all active courses",
            inputSchema: {
              type: "object",
              properties: {
                days: {
                  type: "number",
                  description: "Number of days to look back (default: 14)",
                  default: 14,
                },
                courseId: {
                  type: "string",
                  description: "Optional: The ID of a specific course to fetch announcements for",
                  required: false,
                },
              },
              required: [],
            },
          },
          {
            name: "find-course-files",
            description: "Search files within a course",
            inputSchema: {
              type: "object",
              properties: {
                courseId: {
                  type: "string",
                  description: "The ID of the course",
                },
                searchTerm: {
                  type: "string",
                  description: "Term to search for in file names",
                },
              },
              required: ["courseId", "searchTerm"],
            },
          },
          {
            name: "find-office-hours-info",
            description: "Search common locations within a course for instructor office hours information (e.g., syllabus, announcements).",
            inputSchema: {
              type: "object",
              properties: {
                courseId: {
                  type: "string",
                  description: "The ID of the course to search within.",
                },
              },
              required: ["courseId"],
            },
          },
        ],
      };
      console.error("Sending ListToolsResponse:", JSON.stringify(toolsResponse).substring(0, 200) + '...');
      return toolsResponse;
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      console.error(`Received CallToolRequest for: ${name} with args: ${JSON.stringify(args)}`);

      try {
        switch (name) {
          case "list-courses":
            return await listCourses(this.axiosInstance);

          case "list-rubrics":
            if (!args || typeof args.courseId !== 'string') {
              throw new Error("Missing or invalid 'courseId' argument for list-rubrics");
            }
            return await listRubrics(this.axiosInstance, args as { courseId: string });

          case "list-assignments":
            if (!args || typeof args.courseId !== 'string') {
              throw new Error("Missing or invalid 'courseId' argument for list-assignments");
            }
            return await listAssignments(this.axiosInstance, args as { courseId: string; studentId?: string; includeSubmissionHistory?: boolean });

          case "list-sections":
            if (!args || typeof args.courseId !== 'string') {
              throw new Error("Missing or invalid 'courseId' argument for list-sections");
            }
            return await listSections(this.axiosInstance, args as { courseId: string; includeStudentCount?: boolean });

          case "get-my-todo-items":
            return await getMyTodoItems(this.axiosInstance);

          case "get-upcoming-assignments":
            return await getUpcomingAssignments(this.axiosInstance);

          case "get-course-grade":
            if (!args || typeof args.courseId !== 'string') {
              throw new Error("Missing or invalid 'courseId' argument for get-course-grade");
            }
            return await getCourseGrade(this.axiosInstance, args as { courseId: string });

          case "get-assignment-details":
            if (!args || typeof args.courseId !== 'string' || typeof args.assignmentId !== 'string') {
              throw new Error("Missing or invalid 'courseId' or 'assignmentId' arguments for get-assignment-details");
            }
            return await getAssignmentDetails(this.axiosInstance, args as { courseId: string; assignmentId: string });

          case "get-recent-announcements":
            return await getRecentAnnouncements(this.axiosInstance, args as { days?: number, courseId?: string });

          case "find-course-files":
            if (!args || typeof args.courseId !== 'string' || typeof args.searchTerm !== 'string') {
              throw new Error("Missing or invalid 'courseId' or 'searchTerm' arguments for find-course-files");
            }
            return await findCourseFiles(this.axiosInstance, args as { courseId: string; searchTerm: string });

          case "find-office-hours-info":
            if (!args || typeof args.courseId !== 'string') {
              throw new Error("Missing or invalid 'courseId' argument for find-office-hours-info");
            }
            return await findOfficeHoursInfo(this.axiosInstance, args as { courseId: string });

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error: any) {
        console.error(`Error executing tool '${name}':`, error);
        return {
          error: {
            code: -32000,
            message: `Tool execution failed: ${error.message}`,
          },
        };
      }
    });

    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: [
          {
            name: "analyze-rubric-statistics",
            description: "Analyze rubric statistics for formative assignments in a course",
            arguments: [
              {
                name: "courseName",
                description: "The name of the course to analyze",
                required: true,
              },
            ],
          },
          {
            name: "summarize-upcoming-week",
            description: "Summarize assignments and events due soon",
            arguments: [],
          },
          {
            name: "check-my-grades",
            description: "Report current overall grade for specified courses",
            arguments: [
              {
                name: "courseName",
                description: "Name of the course (or 'all' for all active courses)",
                required: true,
              },
            ],
          },
          {
            name: "find-lecture-slides",
            description: "Find lecture slides or notes in a course",
            arguments: [
              {
                name: "courseName",
                description: "Name of the course to search in",
                required: true,
              },
              {
                name: "topic",
                description: "Topic to search for in the file names",
                required: true,
              },
            ],
          },
          {
            name: "what-did-i-miss",
            description: "Summarize recent course activity",
            arguments: [
              {
                name: "courseName",
                description: "Name of the course to check recent activity",
                required: true,
              },
            ],
          },
        ],
      };
    });

    this.server.setRequestHandler(GetPromptRequestSchema, async (request, extra): Promise<z.infer<typeof GetPromptResultSchema>> => {
      const promptName = request.params.name;
      const promptArgs = request.params.arguments;

      if (promptName === "analyze-rubric-statistics") {
        const courseName = promptArgs?.courseName;
        const today = new Date().toISOString().split('T')[0];

        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Please analyze the rubric statistics for the course "${courseName}". Follow these steps:

1. First, use the list-courses tool to find the course ID for "${courseName}".

2. Then, use the list-assignments tool to get all assignments for this course.

3. For each formative assignment that has a due date before ${today}:
   - Use the get-rubric-statistics tool to get detailed statistics
   - Include the point distribution to create visualizations
   - Skip assignments with future due dates (after ${today})

4. Create and analyze two comprehensive visualizations that show all assignments together:
   a) Grouped Stacked Bar Chart:
      - X-axis: Criteria names
      - Y-axis: Percentage of students
      - Groups: One group of stacked bars per assignment
      - Bars: Stacked to show score distribution (0-4 points)
      - Colors: Consistent colors across assignments for each point value
      - Legend: Include both assignment names and point values
      
   b) Grouped Bar Chart:
      - X-axis: Criteria names
      - Y-axis: Average score
      - Groups: One bar per assignment for each criterion
      - Colors: Different color for each assignment
      - Include error bars showing standard deviation if available

5. Provide a summary of key insights based on:
   - Score distributions across criteria and assignments
   - Progression or patterns between assignments
   - Common areas of strength or difficulty across assignments
   - Notable trends or changes between assignments
   - Specific criteria that show consistent or varying performance

Please ensure all visualizations are clearly labeled with:
- Descriptive title (including analysis date: ${today})
- Axis labels
- Legend showing assignments and score levels
- Clear distinction between assignments
- Percentage or count indicators where appropriate`,
              },
            },
          ],
        };
      } else if (promptName === "summarize-upcoming-week") {
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Please provide a summary of my upcoming assignments and tasks for the next week. Follow these steps:

1. Use the get-my-todo-items tool to fetch my current to-do list.

2. Use the get-upcoming-assignments tool to fetch assignments due soon across all my courses.

3. Organize and synthesize this information into a clear, prioritized summary that includes:
   - Items due today (highest priority)
   - Items due in the next 3 days (high priority)
   - Items due in 4-7 days (medium priority)
   - Longer-term items I should be aware of (lower priority)

4. For each item, include:
   - Assignment/task name
   - Course name
   - Due date and time
   - Points possible (if applicable)
   - Submission status (if already submitted)

5. Add a brief summary section at the beginning highlighting:
   - Total number of upcoming items
   - Number of items due this week
   - Any high-point assignments that deserve special attention
   - Any patterns or clusters of due dates I should be aware of
   
Please format the information in a clean, scannable way, sorted by due date within each priority level.`,
              },
            },
          ],
        };
      } else if (promptName === "check-my-grades") {
        const courseName = promptArgs?.courseName;

        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Please check and report my current grades. Follow these steps:

1. Use the list-courses tool to find all my active courses.

2. ${courseName?.toLowerCase() === 'all' ?
                   `For each active course, use the get-course-grade tool to fetch my current grade information.` :
                   `Find the course ID for "${courseName}" and use the get-course-grade tool to fetch my current grade information for that specific course.`}

3. Present the grade information in a clear format that includes:
   - Course name
   - Current grade (letter grade if available)
   - Current score (percentage)
   - Final grade (if different from current grade)
   - Final score (if different from current score)
   
4. If grades are missing or unavailable for any courses, note this clearly.

5. Include a brief summary highlighting:
   - My highest performing course(s)
   - Any courses where my grade might be concerning
   - Overall GPA if that information is calculable

Please present this information in a straightforward manner that helps me understand my current academic standing.`,
              },
            },
          ],
        };
      } else if (promptName === "find-lecture-slides") {
        const courseName = promptArgs?.courseName;
        const topic = promptArgs?.topic;

        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Please help me find lecture slides or notes about "${topic}" in my "${courseName}" course. Follow these steps:

1. Use the list-courses tool to find the course ID for "${courseName}".

2. Once you have the course ID, use the find-course-files tool to search for files related to "${topic}" within that course.
   - Use "${topic}" as the search term
   - Pay special attention to PDF, PowerPoint, or other document files that might contain lecture materials

3. If the initial search doesn't yield relevant results, try these alternative search terms related to "${topic}":
   - Try different forms of the word (plural/singular)
   - Try synonyms or related concepts
   - Try searching for "lecture" + "${topic}"
   - Try searching for "notes" + "${topic}"

4. For each relevant file found, provide:
   - File name
   - File type
   - File size
   - Date created or modified
   - Direct URL to access the file

5. If multiple related files are found, suggest which might be most relevant based on:
   - How recently they were added
   - File names that suggest comprehensive content
   - File types that suggest presentation materials

Please present the results in a clear, organized format that helps me quickly identify the most relevant lecture materials.`,
              },
            },
          ],
        };
      } else if (promptName === "what-did-i-miss") {
        const courseName = promptArgs?.courseName;

        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Please summarize recent activity in my "${courseName}" course to help me catch up on what I might have missed. Follow these steps:

1. Use the list-courses tool to find the course ID for "${courseName}".

2. Once you have the course ID, gather information about recent course activity:
   - Use the get-recent-announcements tool to fetch recent announcements
   - Use the get-unread-discussions tool to identify discussion topics I haven't read
   - For any unread discussions that seem particularly important, use the view-discussion-topic tool to see their content

3. Organize this information into a comprehensive summary of recent course activity:
   - Important announcements from the instructor
   - Key discussion topics and themes
   - Any mentioned deadlines, changes to the syllabus, or important events
   - Required actions I need to take

4. Prioritize the information based on:
   - Recency (newest first)
   - Importance (instructor announcements usually most important)
   - Relevance to upcoming assignments or assessments
   - Activity level (discussions with many replies may be more significant)

5. Include a brief "Action Items" section highlighting any specific tasks I should complete to catch up.

Please present this information in a clear, concise format that helps me quickly understand what's been happening in the course and what I need to do next.`,
              },
            },
          ],
        };
      }

      console.error(`Unknown prompt requested: ${promptName}`);
      return {
        messages: [],
      };
    });
  }

  public async start() {
    const transport = new StdioServerTransport();
    console.error("Attempting to connect server to stdio transport...");
    try {
      await this.server.connect(transport);
      console.error("Canvas MCP Server successfully connected and running on stdio");
    } catch (error: unknown) {
      console.error("Error connecting server to stdio transport:", error);
      throw error;
    }
  }
}

const config: CanvasConfig = {
  apiToken: process.env.CANVAS_API_TOKEN || "",
  baseUrl: process.env.CANVAS_BASE_URL || "https://fhict.instructure.com",
};

if (!config.apiToken) {
  console.error("Error: CANVAS_API_TOKEN environment variable is required");
  process.exit(1);
}

const server = new CanvasServer(config);
console.error("Starting Canvas MCP Server...");
server.start().catch((error: unknown) => {
  console.error("Fatal error during server startup:", error);
  process.exit(1);
});
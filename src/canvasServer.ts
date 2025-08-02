import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  GetPromptResultSchema, // Corrected import: Use GetPromptResultSchema
} from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosInstance } from 'axios';
import { CanvasConfig, Course, Rubric } from './types.js';
import { StudentTools } from './studentTools.js';
import { z } from 'zod';
import { logger } from './logger.js';
import { delay } from './utils.js';

// Handles integration with Canvas LMS through Model Context Protocol
export class CanvasServer {
  private server: Server;
  private config: CanvasConfig;
  private axiosInstance: AxiosInstance;
  private studentTools: StudentTools;

  constructor(config: CanvasConfig) {
    this.config = config;

    // Initialize server
    this.server = new Server(
      {
        name: 'canvas-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          prompts: {},
        },
      }
    );

    // Initialize axios instance with base configuration
    this.axiosInstance = axios.create({
      baseURL: this.config.baseUrl,
      headers: {
        Authorization: `Bearer ${this.config.apiToken}`,
      },
    });

    // Initialize student tools
    this.studentTools = new StudentTools(this.config);

    // Set up request handlers
    this.setupRequestHandlers();
  }

  // Configures handlers for available tools and their execution
  private setupRequestHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.info('Received ListToolsRequest');
      const toolsResponse = {
        tools: [
          {
            name: 'list-courses',
            description: 'List all courses for the authenticated user',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
            },
          },
          {
            name: 'list-rubrics',
            description: 'List all rubrics for a specific course',
            inputSchema: {
              type: 'object',
              properties: {
                courseId: {
                  type: 'string',
                  description: 'The ID of the course',
                },
              },
              required: ['courseId'],
            },
          },
          {
            name: 'list-assignments',
            description:
              'Get a list of all assignments in a course with submission status for students',
            inputSchema: {
              type: 'object',
              properties: {
                courseId: {
                  type: 'string',
                  description: 'The ID of the course',
                },
                studentId: {
                  type: 'string',
                  description: 'Optional: Get submission status for a specific student',
                  required: false,
                },
                includeSubmissionHistory: {
                  type: 'boolean',
                  description: 'Whether to include submission history details',
                  default: false,
                },
              },
              required: ['courseId'],
            },
          },
          {
            name: 'list-sections',
            description: 'Get a list of all sections in a course',
            inputSchema: {
              type: 'object',
              properties: {
                courseId: {
                  type: 'string',
                  description: 'The ID of the course',
                },
                includeStudentCount: {
                  type: 'boolean',
                  description: 'Whether to include the number of students in each section',
                  default: false,
                },
              },
              required: ['courseId'],
            },
          },
          {
            name: 'get-my-todo-items',
            description: "Fetch the authenticated student's to-do list",
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
            },
          },
          {
            name: 'get-upcoming-assignments',
            description: 'Fetch upcoming assignments across all active courses for the student',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
            },
          },
          {
            name: 'get-course-grade',
            description: "Fetch student's current overall grade in a specific course",
            inputSchema: {
              type: 'object',
              properties: {
                courseId: {
                  type: 'string',
                  description: 'The ID of the course',
                },
              },
              required: ['courseId'],
            },
          },
          {
            name: 'get-assignment-details',
            description:
              "Fetch details for a specific assignment including student's submission status",
            inputSchema: {
              type: 'object',
              properties: {
                courseId: {
                  type: 'string',
                  description: 'The ID of the course',
                },
                assignmentId: {
                  type: 'string',
                  description: 'The ID of the assignment',
                },
              },
              required: ['courseId', 'assignmentId'],
            },
          },
          {
            name: 'get-recent-announcements',
            description: 'Fetch recent announcements from all active courses',
            inputSchema: {
              type: 'object',
              properties: {
                days: {
                  type: 'number',
                  description: 'Number of days to look back (default: 14)',
                  default: 14,
                },
              },
              required: [],
            },
          },
          {
            name: 'list-course-modules',
            description: 'List modules and items for a course, with student completion status',
            inputSchema: {
              type: 'object',
              properties: {
                courseId: {
                  type: 'string',
                  description: 'The ID of the course',
                },
              },
              required: ['courseId'],
            },
          },
          {
            name: 'find-course-files',
            description: 'Search files within a course',
            inputSchema: {
              type: 'object',
              properties: {
                courseId: {
                  type: 'string',
                  description: 'The ID of the course',
                },
                searchTerm: {
                  type: 'string',
                  description: 'Term to search for in file names',
                },
              },
              required: ['courseId', 'searchTerm'],
            },
          },
          {
            name: 'get-unread-discussions',
            description: 'List unread discussion topics for a course',
            inputSchema: {
              type: 'object',
              properties: {
                courseId: {
                  type: 'string',
                  description: 'The ID of the course',
                },
              },
              required: ['courseId'],
            },
          },
          {
            name: 'view-discussion-topic',
            description: 'Retrieve posts/replies for a discussion topic',
            inputSchema: {
              type: 'object',
              properties: {
                courseId: {
                  type: 'string',
                  description: 'The ID of the course',
                },
                topicId: {
                  type: 'string',
                  description: 'The ID of the discussion topic',
                },
              },
              required: ['courseId', 'topicId'],
            },
          },
          {
            name: 'get-my-quiz-submission',
            description: "Retrieve student's submission details for a quiz",
            inputSchema: {
              type: 'object',
              properties: {
                courseId: {
                  type: 'string',
                  description: 'The ID of the course',
                },
                quizId: {
                  type: 'string',
                  description: 'The ID of the quiz',
                },
              },
              required: ['courseId', 'quizId'],
            },
          },
          {
            name: 'find-office-hours-info',
            description:
              'Search common locations within a course for instructor office hours information (e.g., syllabus, announcements).',
            inputSchema: {
              type: 'object',
              properties: {
                courseId: {
                  type: 'string',
                  description: 'The ID of the course to search within.',
                },
              },
              required: ['courseId'],
            },
          },
        ],
      };
      logger.info(
        'Sending ListToolsResponse:',
        JSON.stringify(toolsResponse).substring(0, 200) + '...'
      );
      return toolsResponse;
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args } = request.params;
      logger.info(`Received CallToolRequest for: ${name} with args: ${JSON.stringify(args)}`);

      try {
        switch (name) {
          case 'list-courses':
            return await this.handleListCourses();

          case 'list-rubrics':
            if (!args || typeof args.courseId !== 'string') {
              throw new Error("Missing or invalid 'courseId' argument for list-rubrics");
            }
            return await this.handleListRubrics(args as { courseId: string });

          case 'list-assignments':
            if (!args || typeof args.courseId !== 'string') {
              throw new Error("Missing or invalid 'courseId' argument for list-assignments");
            }
            // Pass the whole args object
            return await this.handleListAssignments(
              args as { courseId: string; studentId?: string; includeSubmissionHistory?: boolean }
            );

          case 'list-sections':
            if (!args || typeof args.courseId !== 'string') {
              throw new Error("Missing or invalid 'courseId' argument for list-sections");
            }
            // Pass the whole args object
            return await this.handleListSections(
              args as { courseId: string; includeStudentCount?: boolean }
            );

          // Student-specific tools delegated to StudentTools class
          case 'get-my-todo-items':
            return await this.studentTools.getMyTodoItems();

          case 'get-upcoming-assignments':
            return await this.studentTools.getUpcomingAssignments();

          case 'get-course-grade':
            if (!args || typeof args.courseId !== 'string') {
              throw new Error("Missing or invalid 'courseId' argument for get-course-grade");
            }
            return await this.studentTools.getCourseGrade(args as { courseId: string });

          case 'get-assignment-details':
            if (
              !args ||
              typeof args.courseId !== 'string' ||
              typeof args.assignmentId !== 'string'
            ) {
              throw new Error(
                "Missing or invalid 'courseId' or 'assignmentId' arguments for get-assignment-details"
              );
            }
            return await this.studentTools.getAssignmentDetails(
              args as { courseId: string; assignmentId: string }
            );

          case 'get-recent-announcements':
            // Args are optional here (days, courseId)
            return await this.studentTools.getRecentAnnouncements(
              args as { days?: number; courseId?: string }
            );

          // case "list-course-modules": // Method not yet implemented in StudentTools
          //   if (!args || typeof args.courseId !== 'string') {
          //     throw new Error("Missing or invalid 'courseId' argument for list-course-modules");
          //   }
          //   // return await this.studentTools.listCourseModules(args as { courseId: string });
          //   throw new Error("Tool 'list-course-modules' is not yet implemented.");

          case 'find-course-files': // Now implemented
            if (!args || typeof args.courseId !== 'string' || typeof args.searchTerm !== 'string') {
              throw new Error(
                "Missing or invalid 'courseId' or 'searchTerm' arguments for find-course-files"
              );
            }
            return await this.studentTools.findCourseFiles(
              args as { courseId: string; searchTerm: string }
            );

          // case "get-unread-discussions": // Method not yet implemented in StudentTools
          //   if (!args || typeof args.courseId !== 'string') {
          //     throw new Error("Missing or invalid 'courseId' argument for get-unread-discussions");
          //   }
          //   // return await this.studentTools.getUnreadDiscussions(args as { courseId: string });
          //    throw new Error("Tool 'get-unread-discussions' is not yet implemented.");

          // case "view-discussion-topic": // Method not yet implemented in StudentTools
          //   if (!args || typeof args.courseId !== 'string' || typeof args.topicId !== 'string') {
          //     throw new Error("Missing or invalid 'courseId' or 'topicId' arguments for view-discussion-topic");
          //   }
          //   // return await this.studentTools.viewDiscussionTopic(args as { courseId: string; topicId: string });
          //    throw new Error("Tool 'view-discussion-topic' is not yet implemented.");

          // case "get-my-quiz-submission": // Method not yet implemented in StudentTools
          //   if (!args || typeof args.courseId !== 'string' || typeof args.quizId !== 'string') {
          //     throw new Error("Missing or invalid 'courseId' or 'quizId' arguments for get-my-quiz-submission");
          //   }
          //   // return await this.studentTools.getMyQuizSubmission(args as { courseId: string; quizId: string });
          //    throw new Error("Tool 'get-my-quiz-submission' is not yet implemented.");

          // Add the case for the new tool
          case 'find-office-hours-info':
            if (!args || typeof args.courseId !== 'string') {
              throw new Error("Missing or invalid 'courseId' argument for find-office-hours-info");
            }
            // Call the new handler method instead of directly calling studentTools
            return await this.handleFindOfficeHours(args as { courseId: string });

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error: any) {
        logger.error(`Error executing tool '${name}':`, error);
        return {
          error: {
            code: -32000,
            message: `Tool execution failed: ${error.message}`,
          },
        };
      }
    });

    // Add these handlers for prompts
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: [
          {
            name: 'analyze-rubric-statistics',
            description: 'Analyze rubric statistics for formative assignments in a course',
            arguments: [
              {
                name: 'courseName',
                description: 'The name of the course to analyze',
                required: true,
              },
            ],
          },
          {
            name: 'summarize-upcoming-week',
            description: 'Summarize assignments and events due soon',
            arguments: [],
          },
          {
            name: 'check-my-grades',
            description: 'Report current overall grade for specified courses',
            arguments: [
              {
                name: 'courseName',
                description: "Name of the course (or 'all' for all active courses)",
                required: true,
              },
            ],
          },
          {
            name: 'find-lecture-slides',
            description: 'Find lecture slides or notes in a course',
            arguments: [
              {
                name: 'courseName',
                description: 'Name of the course to search in',
                required: true,
              },
              {
                name: 'topic',
                description: 'Topic to search for in the file names',
                required: true,
              },
            ],
          },
          {
            name: 'what-did-i-miss',
            description: 'Summarize recent course activity',
            arguments: [
              {
                name: 'courseName',
                description: 'Name of the course to check recent activity',
                required: true,
              },
            ],
          },
        ],
      };
    });

    this.server.setRequestHandler(
      GetPromptRequestSchema,
      async (request): Promise<z.infer<typeof GetPromptResultSchema>> => {
        const promptName = request.params.name;
        const promptArgs = request.params.arguments;

        if (promptName === 'analyze-rubric-statistics') {
          const courseName = promptArgs?.courseName;
          const today = new Date().toISOString().split('T')[0];

          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
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
        } else if (promptName === 'summarize-upcoming-week') {
          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
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
        } else if (promptName === 'check-my-grades') {
          const courseName = promptArgs?.courseName;

          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Please check and report my current grades. Follow these steps:

1. Use the list-courses tool to find all my active courses.

2. ${
                    courseName?.toLowerCase() === 'all'
                      ? `For each active course, use the get-course-grade tool to fetch my current grade information.`
                      : `Find the course ID for "${courseName}" and use the get-course-grade tool to fetch my current grade information for that specific course.`
                  }

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
        } else if (promptName === 'find-lecture-slides') {
          const courseName = promptArgs?.courseName;
          const topic = promptArgs?.topic;

          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
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
        } else if (promptName === 'what-did-i-miss') {
          const courseName = promptArgs?.courseName;

          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
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

        // If prompt name doesn't match, return an empty messages array
        // This satisfies the schema requirement for a 'messages' property.
        logger.error(`Unknown prompt requested: ${promptName}`);
        return {
          messages: [],
        };
      }
    );
  }

  // Fetches and formats a list of all active courses from Canvas
  private async handleListCourses() {
    const maxRetries = 2; // Retry up to 2 times (3 attempts total)
    const retryDelay = 1000; // 1 second delay between retries

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`Attempt ${attempt + 1} to fetch courses...`); // Log attempt
        const response = await this.axiosInstance.get('/api/v1/courses', {
          params: {
            enrollment_state: 'active',
            state: ['available'],
            per_page: 100,
            include: ['term'],
          },
          timeout: 15000, // Keep the 15-second timeout
        });

        const courses: Course[] = response.data;

        const formattedCourses = courses
          .filter(course => course.workflow_state === 'available')
          .map((course: Course) => {
            const termInfo = course.term ? ` (${course.term.name})` : '';
            return `Course: ${course.name}${termInfo}\nID: ${course.id}\nCode: ${course.course_code}\n---`;
          })
          .join('\n');

        // Success, return the result
        return {
          content: [
            {
              type: 'text',
              text: formattedCourses
                ? `Available Courses:\n\n${formattedCourses}`
                : 'No active courses found.',
            },
          ],
        };
      } catch (error: unknown) {
        logger.error(`Attempt ${attempt + 1} failed.`); // Log failure

        // Check if it's an Axios error and specifically ECONNRESET
        if (axios.isAxiosError(error) && error.code === 'ECONNRESET') {
          logger.error(
            `Axios ECONNRESET error fetching courses (Attempt ${attempt + 1}/${maxRetries + 1}): ${error.message}`
          );
          if (attempt < maxRetries) {
            logger.error(`Retrying in ${retryDelay / 1000} second(s)...`);
            await delay(retryDelay); // Wait before retrying
            continue; // Go to the next iteration of the loop
          } else {
            logger.error('Max retries reached for ECONNRESET.');
            // Fall through to throw the error after max retries
          }
        } else {
          // Log other errors (Axios or non-Axios)
          if (axios.isAxiosError(error)) {
            logger.error(
              `Axios error fetching courses: ${error.message}`,
              error.code,
              error.config?.url
            );
          } else {
            logger.error('Non-Axios error fetching courses:', error);
          }
          // Don't retry for non-ECONNRESET errors, re-throw immediately
          if (error instanceof Error) {
            throw new Error(`Failed to fetch courses: ${error.message}`);
          }
          throw new Error('Failed to fetch courses: Unknown error');
        }

        // If loop finishes due to max retries on ECONNRESET, throw the last error
        if (error instanceof Error) {
          throw new Error(
            `Failed to fetch courses after ${maxRetries + 1} attempts: ${error.message}`
          );
        }
        throw new Error(`Failed to fetch courses after ${maxRetries + 1} attempts: Unknown error`);
      }
    }
    // This part should theoretically not be reached due to return/throw inside the loop
    throw new Error('handleListCourses exited loop unexpectedly.');
  }

  // Retrieves all rubrics associated with the specified course
  private async handleListRubrics(args: any) {
    const { courseId } = args;

    try {
      const response = await this.axiosInstance.get(`/api/v1/courses/${courseId}/rubrics`);
      const rubrics: Rubric[] = response.data;

      const formattedRubrics = rubrics
        .map(
          (rubric: Rubric) =>
            `Rubric: ${rubric.title}\nID: ${rubric.id}\nDescription: ${rubric.description || 'No description'}\n---`
        )
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text: formattedRubrics || 'No rubrics found for this course',
          },
        ],
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch rubrics: ${error.message}`);
      }
      throw new Error('Failed to fetch rubrics: Unknown error');
    }
  }

  // Gets all assignments for a course with optional student submission details
  private async handleListAssignments(args: any) {
    const { courseId, studentId, includeSubmissionHistory = false } = args;
    const assignments: any[] = [];
    let page = 1;
    let hasMore = true;

    try {
      while (hasMore) {
        const response = await this.axiosInstance.get(`/api/v1/courses/${courseId}/assignments`, {
          params: {
            per_page: 100,
            page: page,
            include: studentId ? ['submission', 'submission_comments', 'submission_history'] : [],
            student_ids: studentId ? [studentId] : undefined,
            order_by: 'position',
          },
        });

        logger.info(`Fetched ${response.data.length} assignments from page ${page}`);

        const pageAssignments = response.data;
        assignments.push(...pageAssignments);

        hasMore = pageAssignments.length === 100;
        page += 1;
      }

      const formattedAssignments = assignments
        .map(assignment => {
          const parts = [
            `Assignment: ${assignment.name}`,
            `ID: ${assignment.id}`,
            `Due Date: ${assignment.due_at || 'No due date'}`,
            `Points Possible: ${assignment.points_possible}`,
            `Status: ${assignment.published ? 'Published' : 'Unpublished'}`,
          ];

          if (assignment.submission) {
            parts.push('Submission:');
            parts.push(`  Status: ${assignment.submission.workflow_state}`);
            parts.push(`  Submitted: ${assignment.submission.submitted_at || 'Not submitted'}`);

            if (assignment.submission.score !== undefined) {
              parts.push(`  Score: ${assignment.submission.score}`);
            }

            if (assignment.submission.submission_comments?.length > 0) {
              parts.push('  Teacher Comments:');
              assignment.submission.submission_comments
                .filter((comment: any) => comment.author?.role === 'teacher')
                .forEach((comment: any) => {
                  const date = new Date(comment.created_at).toLocaleString();
                  parts.push(`    [${date}] ${comment.comment}`);
                });
            } else {
              parts.push('  Teacher Comments: None');
            }

            if (
              includeSubmissionHistory &&
              assignment.submission.versioned_submissions?.length > 0
            ) {
              parts.push('  Submission History:');
              assignment.submission.versioned_submissions
                .sort(
                  (a: any, b: any) =>
                    new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()
                )
                .forEach((version: any, index: number) => {
                  const date = new Date(version.submitted_at).toLocaleString();
                  parts.push(`    Attempt ${index + 1} [${date}]:`);
                  if (version.score !== undefined) {
                    parts.push(`      Score: ${version.score}`);
                  }
                  if (version.grade) {
                    parts.push(`      Grade: ${version.grade}`);
                  }
                  if (version.submission_type) {
                    parts.push(`      Type: ${version.submission_type}`);
                  }
                });
            }
          } else {
            parts.push('Submission: No submission data available');
          }

          return parts.join('\n');
        })
        .join('\n---\n');

      return {
        content: [
          {
            type: 'text',
            text:
              assignments.length > 0
                ? `Assignments in course ${courseId}:\n\n${formattedAssignments}\n\nTotal assignments: ${assignments.length}`
                : 'No assignments found in this course.',
          },
        ],
      };
    } catch (error: any) {
      logger.error('Full error details:', error.response?.data || error);
      if (error.response?.data?.errors) {
        throw new Error(
          `Failed to fetch assignments: ${JSON.stringify(error.response.data.errors)}`
        );
      }
      if (error instanceof Error) {
        throw new Error(`Failed to fetch assignments: ${error.message}`);
      }
      throw new Error('Failed to fetch assignments: Unknown error');
    }
  }

  // Retrieves all sections for a course
  private async handleListSections(args: any) {
    const { courseId, includeStudentCount = false } = args;
    const sections: any[] = [];
    let page = 1;
    let hasMore = true;

    try {
      while (hasMore) {
        const response = await this.axiosInstance.get(`/api/v1/courses/${courseId}/sections`, {
          params: {
            per_page: 100,
            page: page,
            include: includeStudentCount ? ['total_students'] : [],
          },
        });

        const pageSections = response.data;
        sections.push(...pageSections);

        hasMore = pageSections.length === 100;
        page += 1;
      }

      const formattedSections = sections
        .map(section => {
          const parts = [
            `Name: ${section.name}`,
            `ID: ${section.id}`,
            `SIS ID: ${section.sis_section_id || 'N/A'}`,
          ];

          if (section.start_at) {
            parts.push(`Start Date: ${new Date(section.start_at).toLocaleDateString()}`);
          }
          if (section.end_at) {
            parts.push(`End Date: ${new Date(section.end_at).toLocaleDateString()}`);
          }

          if (includeStudentCount) {
            parts.push(`Total Students: ${section.total_students || 0}`);
          }

          if (section.restrict_enrollments_to_section_dates) {
            parts.push('Restricted to Section Dates: Yes');
          }

          return parts.join('\n');
        })
        .join('\n---\n');

      return {
        content: [
          {
            type: 'text',
            text:
              sections.length > 0
                ? `Sections in course ${courseId}:\n\n${formattedSections}\n\nTotal sections: ${sections.length}`
                : 'No sections found in this course.',
          },
        ],
      };
    } catch (error: any) {
      logger.error('Full error details:', error.response?.data || error);
      if (error.response?.status === 404) {
        throw new Error(`Course ${courseId} not found`);
      }
      if (error.response?.data?.errors) {
        throw new Error(`Failed to fetch sections: ${JSON.stringify(error.response.data.errors)}`);
      }
      if (error instanceof Error) {
        throw new Error(`Failed to fetch sections: ${error.message}`);
      }
      throw new Error('Failed to fetch sections: Unknown error');
    }
  }

  // New handler method for finding office hours
  private async handleFindOfficeHours(args: { courseId: string }) {
    try {
      logger.info(`Executing find-office-hours-info for course ${args.courseId}`);
      const results = await this.studentTools.findOfficeHoursInfo(args);
      logger.info(`find-office-hours-info result: ${JSON.stringify(results).substring(0, 200)}...`);
      return results;
    } catch (error: any) {
      logger.error(`Error in handleFindOfficeHours: ${error.message}`);
      return {
        error: {
          code: -32001,
          message: `Tool execution failed for find-office-hours-info: ${error.message}`,
        },
      };
    }
  }

  // Helper method to fetch all pages
  // Starts the server using stdio transport
  public async start() {
    const transport = new StdioServerTransport();
    logger.info('Attempting to connect server to stdio transport...');
    try {
      await this.server.connect(transport);
      logger.info('Canvas MCP Server successfully connected and running on stdio');
    } catch (error: unknown) {
      logger.error('Error connecting server to stdio transport:', error);
      throw error;
    }
  }
}

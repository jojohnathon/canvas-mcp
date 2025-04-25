import 'dotenv/config';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from 'axios';
import { CanvasConfig, Course, Rubric } from './types.js';
import { StudentTools } from './studentTools.js';

// Add this interface near the top of the file, with the other types
interface RubricStat {
  id: string;
  description: string;
  points_possible: number;
  total_assessments: number;
  average_score: number;
  median_score: number;
  min_score: number;
  max_score: number;
  point_distribution?: { [key: number]: number };
}

// Handles integration with Canvas LMS through Model Context Protocol
class CanvasServer {
  private server: Server;
  private config: CanvasConfig;
  private axiosInstance;
  private studentTools: StudentTools;

  constructor(config: CanvasConfig) {
    this.config = config;
    
    // Initialize server
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

    // Initialize axios instance with base configuration
    this.axiosInstance = axios.create({
      baseURL: this.config.baseUrl,
      headers: {
        Authorization: `Bearer ${this.config.apiToken}`,
      },
    });

    // Initialize student tools
    this.studentTools = new StudentTools(this.config.baseUrl, this.config.apiToken);

    // Set up request handlers
    this.setupRequestHandlers();
  }

  // Configures handlers for available tools and their execution
  private setupRequestHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      console.error("Received ListToolsRequest"); // Log when the handler is invoked
      const toolsResponse = {
        tools: [
          {
            name: "list-courses",
            description: "List all courses for the authenticated user",
            inputSchema: {
              type: "object",
              properties: {},
              required: [],
            },
          },
          {
            name: "post-announcement",
            description: "Post an announcement to a specific course",
            inputSchema: {
              type: "object",
              properties: {
                courseId: {
                  type: "string",
                  description: "The ID of the course",
                },
                title: {
                  type: "string",
                  description: "The title of the announcement",
                },
                message: {
                  type: "string",
                  description: "The content of the announcement",
                },
              },
              required: ["courseId", "title", "message"],
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
            name: "list-students",
            description: "Get a complete list of all students enrolled in a specific course",
            inputSchema: {
              type: "object",
              properties: {
                courseId: {
                  type: "string",
                  description: "The ID of the course",
                },
                includeEmail: {
                  type: "boolean",
                  description: "Whether to include student email addresses",
                  default: false
                }
              },
              required: ["courseId"],
            },
          },
          {
            name: "list-assignments",
            description: "Get a list of all assignments in a course with submission status for students",
            inputSchema: {
              type: "object",
              properties: {
                courseId: {
                  type: "string",
                  description: "The ID of the course"
                },
                studentId: {
                  type: "string",
                  description: "Optional: Get submission status for a specific student",
                  required: false
                },
                includeSubmissionHistory: {
                  type: "boolean",
                  description: "Whether to include submission history details",
                  default: false
                }
              },
              required: ["courseId"]
            }
          },
          {
            name: "list-assignment-submissions",
            description: "Get all student submissions and comments for a specific assignment",
            inputSchema: {
              type: "object",
              properties: {
                courseId: {
                  type: "string",
                  description: "The ID of the course"
                },
                assignmentId: {
                  type: "string",
                  description: "The ID of the assignment"
                },
                includeComments: {
                  type: "boolean",
                  description: "Whether to include submission comments",
                  default: true
                }
              },
              required: ["courseId", "assignmentId"]
            }
          },
          {
            name: "list-section-submissions",
            description: "Get all student submissions for a specific assignment filtered by section",
            inputSchema: {
              type: "object",
              properties: {
                courseId: {
                  type: "string",
                  description: "The ID of the course"
                },
                assignmentId: {
                  type: "string",
                  description: "The ID of the assignment"
                },
                sectionId: {
                  type: "string",
                  description: "The ID of the section"
                },
                includeComments: {
                  type: "boolean",
                  description: "Whether to include submission comments",
                  default: true
                }
              },
              required: ["courseId", "assignmentId", "sectionId"]
            }
          },
          {
            name: "list-sections",
            description: "Get a list of all sections in a course",
            inputSchema: {
              type: "object",
              properties: {
                courseId: {
                  type: "string",
                  description: "The ID of the course"
                },
                includeStudentCount: {
                  type: "boolean",
                  description: "Whether to include the number of students in each section",
                  default: false
                }
              },
              required: ["courseId"]
            }
          },
          {
            name: "post-submission-comment",
            description: "Post a comment on a student's assignment submission",
            inputSchema: {
              type: "object",
              properties: {
                courseId: {
                  type: "string",
                  description: "The ID of the course"
                },
                assignmentId: {
                  type: "string", 
                  description: "The ID of the assignment"
                },
                studentId: {
                  type: "string",
                  description: "The ID of the student"
                },
                comment: {
                  type: "string",
                  description: "The comment text to post"
                }
              },
              required: ["courseId", "assignmentId", "studentId", "comment"]
            }
          },
          {
            name: "get-rubric-statistics",
            description: "Get statistics for rubric assessments on an assignment",
            inputSchema: {
              type: "object",
              properties: {
                courseId: {
                  type: "string",
                  description: "The ID of the course"
                },
                assignmentId: {
                  type: "string",
                  description: "The ID of the assignment"
                },
                includePointDistribution: {
                  type: "boolean",
                  description: "Whether to include point distribution for each criterion",
                  default: true
                }
              },
              required: ["courseId", "assignmentId"]
            }
          },
          // Student tool definitions
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
                  description: "The ID of the course"
                }
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
                  description: "The ID of the course"
                },
                assignmentId: {
                  type: "string",
                  description: "The ID of the assignment"
                }
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
                  default: 14
                }
              },
              required: [],
            },
          },
          {
            name: "list-course-modules",
            description: "List modules and items for a course, with student completion status",
            inputSchema: {
              type: "object",
              properties: {
                courseId: {
                  type: "string",
                  description: "The ID of the course"
                }
              },
              required: ["courseId"],
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
                  description: "The ID of the course"
                },
                searchTerm: {
                  type: "string",
                  description: "Term to search for in file names"
                }
              },
              required: ["courseId", "searchTerm"],
            },
          },
          {
            name: "get-unread-discussions",
            description: "List unread discussion topics for a course",
            inputSchema: {
              type: "object",
              properties: {
                courseId: {
                  type: "string",
                  description: "The ID of the course"
                }
              },
              required: ["courseId"],
            },
          },
          {
            name: "view-discussion-topic",
            description: "Retrieve posts/replies for a discussion topic",
            inputSchema: {
              type: "object",
              properties: {
                courseId: {
                  type: "string",
                  description: "The ID of the course"
                },
                topicId: {
                  type: "string",
                  description: "The ID of the discussion topic"
                }
              },
              required: ["courseId", "topicId"],
            },
          },
          {
            name: "get-my-quiz-submission",
            description: "Retrieve student's submission details for a quiz",
            inputSchema: {
              type: "object",
              properties: {
                courseId: {
                  type: "string",
                  description: "The ID of the course"
                },
                quizId: {
                  type: "string",
                  description: "The ID of the quiz"
                }
              },
              required: ["courseId", "quizId"],
            },
          },
        ],
      };
      console.error("Sending ListToolsResponse:", JSON.stringify(toolsResponse).substring(0, 200) + '...'); // Log the response being sent
      return toolsResponse;
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "list-courses":
            return await this.handleListCourses();
          case "post-announcement":
            return await this.handlePostAnnouncement(args);
          case "list-rubrics":
            return await this.handleListRubrics(args);
          case "list-students":
            return await this.handleListStudents(args);
          case "list-assignments":
            return await this.handleListAssignments(args);
          case "list-assignment-submissions":
            return await this.handleListAssignmentSubmissions(args);
          case "list-section-submissions":
            return await this.handleListSectionSubmissions(args);
          case "list-sections":
            return await this.handleListSections(args);
          case "post-submission-comment":
            return await this.handlePostSubmissionComment(args);
          case "get-rubric-statistics":
            return await this.handleGetRubricStatistics(args);
          // Student tool handlers
          case "get-my-todo-items":
            return await this.studentTools.getMyTodoItems();
          case "get-upcoming-assignments":
            return await this.studentTools.getUpcomingAssignments();
          case "get-course-grade":
            if (!args?.courseId) {
              throw new Error("courseId is required for get-course-grade");
            }
            return await this.studentTools.getCourseGrade({
              courseId: args.courseId as string
            });
          case "get-assignment-details":
            if (!args?.courseId || !args?.assignmentId) {
              throw new Error("courseId and assignmentId are required for get-assignment-details");
            }
            return await this.studentTools.getAssignmentDetails({
              courseId: args.courseId as string,
              assignmentId: args.assignmentId as string
            });
          case "get-recent-announcements":
            return await this.studentTools.getRecentAnnouncements(
              args ? { days: args.days as number } : {}
            );
          case "list-course-modules":
            if (!args?.courseId) {
              throw new Error("courseId is required for list-course-modules");
            }
            return await this.studentTools.listCourseModules({
              courseId: args.courseId as string
            });
          case "find-course-files":
            if (!args?.courseId || !args?.searchTerm) {
              throw new Error("courseId and searchTerm are required for find-course-files");
            }
            return await this.studentTools.findCourseFiles({
              courseId: args.courseId as string,
              searchTerm: args.searchTerm as string
            });
          case "get-unread-discussions":
            if (!args?.courseId) {
              throw new Error("courseId is required for get-unread-discussions");
            }
            return await this.studentTools.getUnreadDiscussions({
              courseId: args.courseId as string
            });
          case "view-discussion-topic":
            if (!args?.courseId || !args?.topicId) {
              throw new Error("courseId and topicId are required for view-discussion-topic");
            }
            return await this.studentTools.viewDiscussionTopic({
              courseId: args.courseId as string,
              topicId: args.topicId as string
            });
          case "get-my-quiz-submission":
            if (!args?.courseId || !args?.quizId) {
              throw new Error("courseId and quizId are required for get-my-quiz-submission");
            }
            return await this.studentTools.getMyQuizSubmission({
              courseId: args.courseId as string,
              quizId: args.quizId as string
            });
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error: any) {
        console.error('Error executing tool:', error);
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error.message}`,
            },
          ],
        };
      }
    });

    // Add these handlers for prompts
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
                required: true
              }
            ]
          },
          // Student-focused prompts
          {
            name: "summarize-upcoming-week",
            description: "Summarize assignments and events due soon",
            arguments: []
          },
          {
            name: "check-my-grades",
            description: "Report current overall grade for specified courses",
            arguments: [
              {
                name: "courseName",
                description: "Name of the course (or 'all' for all active courses)",
                required: true
              }
            ]
          },
          {
            name: "find-lecture-slides",
            description: "Find lecture slides or notes in a course",
            arguments: [
              {
                name: "courseName",
                description: "Name of the course to search in",
                required: true
              },
              {
                name: "topic",
                description: "Topic to search for in the file names",
                required: true
              }
            ]
          },
          {
            name: "what-did-i-miss",
            description: "Summarize recent course activity",
            arguments: [
              {
                name: "courseName",
                description: "Name of the course to check recent activity",
                required: true
              }
            ]
          }
        ]
      };
    });

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      if (request.params.name === "analyze-rubric-statistics") {
        const courseName = request.params.arguments?.courseName;
        const today = new Date().toISOString().split('T')[0]; // Format: YYYY-MM-DD
        
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
- Percentage or count indicators where appropriate`
              }
            }
          ]
        };
      }
      else if (request.params.name === "summarize-upcoming-week") {
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
   
Please format the information in a clean, scannable way, sorted by due date within each priority level.`
              }
            }
          ]
        };
      }
      else if (request.params.name === "check-my-grades") {
        const courseName = request.params.arguments?.courseName;
        
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

Please present this information in a straightforward manner that helps me understand my current academic standing.`
              }
            }
          ]
        };
      }
      else if (request.params.name === "find-lecture-slides") {
        const courseName = request.params.arguments?.courseName;
        const topic = request.params.arguments?.topic;
        
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

Please present the results in a clear, organized format that helps me quickly identify the most relevant lecture materials.`
              }
            }
          ]
        };
      }
      else if (request.params.name === "what-did-i-miss") {
        const courseName = request.params.arguments?.courseName;
        
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

Please present this information in a clear, concise format that helps me quickly understand what's been happening in the course and what I need to do next.`
              }
            }
          ]
        };
      }
      
      throw new Error(`Unknown prompt: ${request.params.name}`);
    });
  }

  // Fetches and formats a list of all active courses from Canvas
  private async handleListCourses() {
    try {
      // Get all active courses with pagination
      const response = await this.axiosInstance.get('/api/v1/courses', {
        params: {
          enrollment_state: 'active', // Only get active enrollments
          state: ['available'], // Only get available courses
          per_page: 100, // Get up to 100 courses per page
          include: ['term'] // Include term info to help identify current courses
        }
      });

      const courses: Course[] = response.data;

      // Filter and format the courses
      const formattedCourses = courses
        .filter(course => course.workflow_state === 'available')
        .map((course: Course) => {
          const termInfo = course.term ? ` (${course.term.name})` : '';
          return `Course: ${course.name}${termInfo}\nID: ${course.id}\nCode: ${course.course_code}\n---`;
        })
        .join('\n');

      return {
        content: [
          {
            type: "text",
            text: formattedCourses ? 
              `Available Courses:\n\n${formattedCourses}` :
              "No active courses found.",
          },
        ],
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch courses: ${error.message}`);
      }
      throw new Error('Failed to fetch courses: Unknown error');
    }
  }

  // Creates a new announcement in the specified course
  private async handlePostAnnouncement(args: any) {
    const { courseId, title, message } = args;

    try {
      await this.axiosInstance.post(
        `/api/v1/courses/${courseId}/discussion_topics`,
        {
          title,
          message,
          is_announcement: true,
        }
      );

      return {
        content: [
          {
            type: "text",
            text: `Successfully posted announcement "${title}" to course ${courseId}`,
          },
        ],
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to post announcement: ${error.message}`);
      }
      throw new Error('Failed to post announcement: Unknown error');
    }
  }

  // Retrieves all rubrics associated with the specified course
  private async handleListRubrics(args: any) {
    const { courseId } = args;

    try {
      const response = await this.axiosInstance.get(
        `/api/v1/courses/${courseId}/rubrics`
      );
      const rubrics: Rubric[] = response.data;

      const formattedRubrics = rubrics.map((rubric: Rubric) => 
        `Rubric: ${rubric.title}\nID: ${rubric.id}\nDescription: ${rubric.description || 'No description'}\n---`
      ).join('\n');

      return {
        content: [
          {
            type: "text",
            text: formattedRubrics || "No rubrics found for this course",
          },
        ],
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch rubrics: ${error.message}`);
      }
      throw new Error('Failed to fetch rubrics: Unknown error');
    }
  }

  // Fetches a complete list of enrolled students for the specified course
  private async handleListStudents(args: any) {
    const { courseId, includeEmail = false } = args;
    const students = [];
    let page = 1;
    let hasMore = true;

    try {
      // Fetch all pages of students
      while (hasMore) {
        const response = await this.axiosInstance.get(
          `/api/v1/courses/${courseId}/users`,
          {
            params: {
              enrollment_type: ['student'], // Only get students
              per_page: 100, // Maximum page size
              page: page,
              include: ['email', 'avatar_url'], // Added avatar_url to includes
              enrollment_state: ['active', 'invited'] // Get both active and invited students
            }
          }
        );

        const pageStudents = response.data;
        students.push(...pageStudents);

        // Check if there are more pages
        hasMore = pageStudents.length === 100;
        page += 1;
      }

      // Format the student list
      const formattedStudents = students
        .map(student => {
          const parts = [
            `Name: ${student.name}`,
            `ID: ${student.id}`,
            `SIS ID: ${student.sis_user_id || 'N/A'}`,
            `Avatar URL: ${student.avatar_url || 'N/A'}`  // Added avatar URL
          ];
          
          if (includeEmail && student.email) {
            parts.push(`Email: ${student.email}`);
          }
          
          return parts.join('\n');
        })
        .join('\n---\n');

      return {
        content: [
          {
            type: "text",
            text: students.length > 0 
              ? `Students in course ${courseId}:\n\n${formattedStudents}\n\nTotal students: ${students.length}`
              : "No students found in this course.",
          },
        ],
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to fetch students: ${error.message}`);
      }
      throw new Error('Failed to fetch students: Unknown error');
    }
  }

  // Gets all assignments for a course with optional student submission details
  private async handleListAssignments(args: any) {
    const { courseId, studentId, includeSubmissionHistory = false } = args;
    let assignments = [];
    let page = 1;
    let hasMore = true;

    try {
      // Fetch all pages of assignments with submission and comment data
      while (hasMore) {
        const response = await this.axiosInstance.get(
          `/api/v1/courses/${courseId}/assignments`,
          {
            params: {
              per_page: 100,
              page: page,
              // Always include submission history when studentId is provided
              include: studentId ? ['submission', 'submission_comments', 'submission_history'] : [],
              student_ids: studentId ? [studentId] : undefined,
              order_by: 'position',
            }
          }
        );

        console.error(`Fetched ${response.data.length} assignments from page ${page}`);

        const pageAssignments = response.data;
        assignments.push(...pageAssignments);

        hasMore = pageAssignments.length === 100;
        page += 1;
      }

      // Format the assignments list
      const formattedAssignments = assignments
        .map(assignment => {
          const parts = [
            `Assignment: ${assignment.name}`,
            `ID: ${assignment.id}`,
            `Due Date: ${assignment.due_at || 'No due date'}`,
            `Points Possible: ${assignment.points_possible}`,
            `Status: ${assignment.published ? 'Published' : 'Unpublished'}`
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

          // Enhanced submission history handling
          if (includeSubmissionHistory && assignment.submission.versioned_submissions?.length > 0) {
            parts.push('  Submission History:');
            assignment.submission.versioned_submissions
              .sort((a: any, b: any) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime())
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
            type: "text",
            text: assignments.length > 0
              ? `Assignments in course ${courseId}:\n\n${formattedAssignments}\n\nTotal assignments: ${assignments.length}`
              : "No assignments found in this course.",
          },
        ],
      };
    } catch (error: any) {
      console.error('Full error details:', error.response?.data || error);
      if (error.response?.data?.errors) {
        throw new Error(`Failed to fetch assignments: ${JSON.stringify(error.response.data.errors)}`);
      }
      if (error instanceof Error) {
        throw new Error(`Failed to fetch assignments: ${error.message}`);
      }
      throw new Error('Failed to fetch assignments: Unknown error');
    }
  }

  // Retrieves all student submissions for a specific assignment
  private async handleListAssignmentSubmissions(args: any) {
    const { courseId, assignmentId, includeComments = true } = args;
    let submissions = [];
    let page = 1;
    let hasMore = true;

    try {
      while (hasMore) {
        const response = await this.axiosInstance.get(
          `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions`,
          {
            params: {
              per_page: 100,
              page: page,
              include: [
                'user',  // Include user information
                'submission_comments', // Include comments
                'assignment' // Include assignment details
              ]
            }
          }
        );

        const pageSubmissions = response.data;
        submissions.push(...pageSubmissions);

        hasMore = pageSubmissions.length === 100;
        page += 1;
      }

      // Format the submissions list
      const formattedSubmissions = submissions
        .map(submission => {
          const parts = [
            `Student: ${submission.user?.name || 'Unknown'}`,
            `Status: ${submission.workflow_state}`,
            `Submitted: ${submission.submitted_at ? new Date(submission.submitted_at).toLocaleString() : 'Not submitted'}`,
            `Grade: ${submission.grade || 'No grade'}`,
            `Score: ${submission.score !== undefined ? submission.score : 'No score'}`
          ];

          if (submission.late) {
            parts.push('Late: Yes');
          }

          if (submission.missing) {
            parts.push('Missing: Yes');
          }

          if (submission.submission_type) {
            parts.push(`Submission Type: ${submission.submission_type}`);
          }

          // Add submission comments if requested
          if (includeComments && submission.submission_comments?.length > 0) {
            parts.push('\nComments:');
            submission.submission_comments.forEach((comment: any) => {
              const date = new Date(comment.created_at).toLocaleString();
              const author = comment.author?.display_name || 'Unknown';
              const role = comment.author?.role || 'unknown role';
              parts.push(`  [${date}] ${author} (${role}):`);
              parts.push(`    ${comment.comment}`);
            });
          }

          return parts.join('\n');
        })
        .join('\n---\n');

      return {
        content: [
          {
            type: "text",
            text: submissions.length > 0
              ? `Submissions for assignment ${assignmentId} in course ${courseId}:\n\n${formattedSubmissions}\n\nTotal submissions: ${submissions.length}`
              : "No submissions found for this assignment.",
          },
        ],
      };
    } catch (error: any) {
      console.error('Full error details:', error.response?.data || error);
      if (error.response?.data?.errors) {
        throw new Error(`Failed to fetch submissions: ${JSON.stringify(error.response.data.errors)}`);
      }
      if (error instanceof Error) {
        throw new Error(`Failed to fetch submissions: ${error.message}`);
      }
      throw new Error('Failed to fetch submissions: Unknown error');
    }
  }

  // Retrieves all student submissions for a specific assignment filtered by section
  private async handleListSectionSubmissions(args: any) {
    const { courseId, assignmentId, sectionId, includeComments = true } = args;
    let submissions = [];
    let page = 1;
    let hasMore = true;

    try {
      // First verify the section exists in the course
      await this.axiosInstance.get(
        `/api/v1/courses/${courseId}/sections/${sectionId}`
      );

      // Fetch submissions for the section
      while (hasMore) {
        const response = await this.axiosInstance.get(
          `/api/v1/sections/${sectionId}/assignments/${assignmentId}/submissions`,
          {
            params: {
              per_page: 100,
              page: page,
              include: [
                'user',
                'submission_comments',
                'assignment'
              ]
            }
          }
        );

        const pageSubmissions = response.data;
        submissions.push(...pageSubmissions);

        hasMore = pageSubmissions.length === 100;
        page += 1;
      }

      // Format the submissions list
      const formattedSubmissions = submissions
        .map(submission => {
          const parts = [
            `Student: ${submission.user?.name || 'Unknown'}`,
            `Status: ${submission.workflow_state}`,
            `Submitted: ${submission.submitted_at ? new Date(submission.submitted_at).toLocaleString() : 'Not submitted'}`,
            `Grade: ${submission.grade || 'No grade'}`,
            `Score: ${submission.score !== undefined ? submission.score : 'No score'}`
          ];

          if (submission.late) {
            parts.push('Late: Yes');
          }

          if (submission.missing) {
            parts.push('Missing: Yes');
          }

          if (submission.submission_type) {
            parts.push(`Submission Type: ${submission.submission_type}`);
          }

          // Add submission comments if requested
          if (includeComments && submission.submission_comments?.length > 0) {
            parts.push('\nComments:');
            submission.submission_comments.forEach((comment: any) => {
              const date = new Date(comment.created_at).toLocaleString();
              const author = comment.author?.display_name || 'Unknown';
              const role = comment.author?.role || 'unknown role';
              parts.push(`  [${date}] ${author} (${role}):`);
              parts.push(`    ${comment.comment}`);
            });
          }

          return parts.join('\n');
        })
        .join('\n---\n');

      return {
        content: [
          {
            type: "text",
            text: submissions.length > 0
              ? `Submissions for assignment ${assignmentId} in section ${sectionId}:\n\n${formattedSubmissions}\n\nTotal submissions: ${submissions.length}`
              : "No submissions found for this assignment in this section.",
          },
        ],
      };
    } catch (error: any) {
      console.error('Full error details:', error.response?.data || error);
      if (error.response?.status === 404) {
        throw new Error(`Section ${sectionId} not found in course ${courseId}`);
      }
      if (error.response?.data?.errors) {
        throw new Error(`Failed to fetch section submissions: ${JSON.stringify(error.response.data.errors)}`);
      }
      if (error instanceof Error) {
        throw new Error(`Failed to fetch section submissions: ${error.message}`);
      }
      throw new Error('Failed to fetch section submissions: Unknown error');
    }
  }

  // Retrieves all student submissions for a specific assignment filtered by section
  private async handleListSections(args: any) {
    const { courseId, includeStudentCount = false } = args;
    let sections = [];
    let page = 1;
    let hasMore = true;

    try {
      // Fetch all pages of sections
      while (hasMore) {
        const response = await this.axiosInstance.get(
          `/api/v1/courses/${courseId}/sections`,
          {
            params: {
              per_page: 100,
              page: page,
              include: includeStudentCount ? ['total_students'] : []
            }
          }
        );

        const pageSections = response.data;
        sections.push(...pageSections);

        hasMore = pageSections.length === 100;
        page += 1;
      }

      // Format the sections list
      const formattedSections = sections
        .map(section => {
          const parts = [
            `Name: ${section.name}`,
            `ID: ${section.id}`,
            `SIS ID: ${section.sis_section_id || 'N/A'}`
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
            type: "text",
            text: sections.length > 0
              ? `Sections in course ${courseId}:\n\n${formattedSections}\n\nTotal sections: ${sections.length}`
              : "No sections found in this course.",
          },
        ],
      };
    } catch (error: any) {
      console.error('Full error details:', error.response?.data || error);
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

  // Posts a comment on a student's assignment submission
  private async handlePostSubmissionComment(args: any) {
    const { courseId, assignmentId, studentId, comment } = args;

    try {
      // Post the comment to the submission
      await this.axiosInstance.put(
        `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/${studentId}/comments`,
        {
          comment: {
            text_comment: comment
          }
        }
      );

      return {
        content: [
          {
            type: "text",
            text: `Successfully posted comment for student ${studentId} on assignment ${assignmentId}`
          }
        ]
      };
    } catch (error: any) {
      console.error('Full error details:', error.response?.data || error);
      if (error.response?.status === 404) {
        throw new Error(`Could not find submission for student ${studentId} on assignment ${assignmentId} in course ${courseId}`);
      }
      if (error.response?.data?.errors) {
        throw new Error(`Failed to post comment: ${JSON.stringify(error.response.data.errors)}`);
      }
      if (error instanceof Error) {
        throw new Error(`Failed to post comment: ${error.message}`);
      }
      throw new Error('Failed to post comment: Unknown error');
    }
  }

  // Handles rubric statistics for an assignment
  private async handleGetRubricStatistics(args: any) {
    const { courseId, assignmentId, includePointDistribution = true } = args;

    try {
      // First get the assignment details with rubric
      const assignmentResponse = await this.axiosInstance.get(
        `/api/v1/courses/${courseId}/assignments/${assignmentId}`,
        {
          params: {
            include: ['rubric']
          }
        }
      );

      if (!assignmentResponse.data.rubric) {
        throw new Error('No rubric found for this assignment');
      }

      // Get all submissions with rubric assessments
      const submissions = await this.fetchAllPages(
        `/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions`,
        {
          params: {
            include: ['rubric_assessment'],
            per_page: 100
          }
        }
      );

      // Calculate statistics for each rubric criterion
      const rubricStats = assignmentResponse.data.rubric.map((criterion: any): RubricStat => {
        const scores = submissions
          .filter((sub: any) => sub.rubric_assessment?.[criterion.id]?.points !== undefined)
          .map((sub: any) => sub.rubric_assessment[criterion.id].points);

        const stats: RubricStat = {
          id: criterion.id,
          description: criterion.description,
          points_possible: criterion.points,
          total_assessments: scores.length,
          average_score: 0,
          median_score: 0,
          min_score: 0,
          max_score: 0
        };

        if (scores.length > 0) {
          stats.average_score = Number((scores.reduce((a: number, b: number) => a + b, 0) / scores.length).toFixed(2));
          stats.median_score = this.calculateMedian(scores);
          stats.min_score = Math.min(...scores);
          stats.max_score = Math.max(...scores);
        }

        if (includePointDistribution) {
          // Create point distribution
          const distribution: { [key: number]: number } = {};
          scores.forEach((score: number) => {
            distribution[score] = (distribution[score] || 0) + 1;
          });
          (stats as any).point_distribution = distribution;
        }

        return stats;
      });

      // Calculate overall statistics
      const totalScores = submissions
        .filter((sub: any) => sub.rubric_assessment)
        .map((sub: any) => {
          return Object.values(sub.rubric_assessment)
            .reduce((sum: number, assessment: any) => sum + (assessment.points || 0), 0);
        });

      const overallStats = {
        total_submissions: submissions.length,
        submissions_with_assessment: totalScores.length,
        overall_average: 0,
        overall_median: 0,
        overall_min: 0,
        overall_max: 0
      };

      if (totalScores.length > 0) {
        overallStats.overall_average = Number((totalScores.reduce((a, b) => a + b, 0) / totalScores.length).toFixed(2));
        overallStats.overall_median = this.calculateMedian(totalScores);
        overallStats.overall_min = Math.min(...totalScores);
        overallStats.overall_max = Math.max(...totalScores);
      }

      // Format the output
      const formattedStats = [
        'Overall Statistics:',
        `Total Submissions: ${overallStats.total_submissions}`,
        `Submissions with Assessment: ${overallStats.submissions_with_assessment}`,
        `Average Score: ${overallStats.overall_average}`,
        `Median Score: ${overallStats.overall_median}`,
        `Min Score: ${overallStats.overall_min}`,
        `Max Score: ${overallStats.overall_max}`,
        '\nCriterion Statistics:',
        ...rubricStats.map((stat: RubricStat) => {
          const parts = [
            `\nCriterion: ${stat.description}`,
            `Points Possible: ${stat.points_possible}`,
            `Total Assessments: ${stat.total_assessments}`,
            `Average Score: ${stat.average_score}`,
            `Median Score: ${stat.median_score}`,
            `Min Score: ${stat.min_score}`,
            `Max Score: ${stat.max_score}`
          ];

          if (includePointDistribution && stat.point_distribution) {
            parts.push('\nPoint Distribution:');
            Object.entries(stat.point_distribution)
              .sort(([a], [b]) => Number(b) - Number(a))
              .forEach(([score, count]) => {
                const percentage = (((count as number) / stat.total_assessments) * 100).toFixed(1);
                parts.push(`  ${score} points: ${count} submissions (${percentage}%)`);
              });
          }

          return parts.join('\n');
        })
      ].join('\n');

      return {
        content: [
          {
            type: "text",
            text: formattedStats
          }
        ]
      };
    } catch (error: any) {
      console.error('Full error details:', error.response?.data || error);
      if (error.response?.status === 404) {
        throw new Error(`Assignment ${assignmentId} not found in course ${courseId}`);
      }
      if (error.response?.data?.errors) {
        throw new Error(`Failed to fetch rubric statistics: ${JSON.stringify(error.response.data.errors)}`);
      }
      throw new Error(`Failed to fetch rubric statistics: ${error.message}`);
    }
  }

  // Helper method to calculate median
  private calculateMedian(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    
    const sorted = [...numbers].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
      return Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(2));
    }
    return Number(sorted[middle].toFixed(2));
  }

  // Helper method to fetch all pages
  private async fetchAllPages(url: string, config: any): Promise<any[]> {
    let results: any[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.axiosInstance.get(url, {
        ...config,
        params: {
          ...config.params,
          page: page
        }
      });

      const pageData = response.data;
      results.push(...pageData);

      hasMore = pageData.length === (config.params.per_page || 10);
      page += 1;
    }

    return results;
  }

  // Starts the server using stdio transport
  public async start() {
    const transport = new StdioServerTransport();
    console.error("Attempting to connect server to stdio transport..."); // Log before connect
    try {
      await this.server.connect(transport);
      console.error("Canvas MCP Server successfully connected and running on stdio"); // Log success
    } catch (error) {
      console.error("Error connecting server to stdio transport:", error); // Log connection error
      throw error; // Re-throw error to ensure process exits if connection fails
    }
  }
}

// Read configuration from environment variables
const config: CanvasConfig = {
  apiToken: process.env.CANVAS_API_TOKEN || "",
  baseUrl: process.env.CANVAS_BASE_URL || "https://fhict.instructure.com",
};

// Validate configuration
if (!config.apiToken) {
  console.error("Error: CANVAS_API_TOKEN environment variable is required");
  process.exit(1);
}

// Start the server
const server = new CanvasServer(config);
console.error("Starting Canvas MCP Server..."); // Log before starting
server.start().catch((error) => {
  console.error("Fatal error during server startup:", error); // Log fatal startup errors
  process.exit(1);
});
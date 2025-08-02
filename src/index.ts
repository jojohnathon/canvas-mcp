import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  GetPromptResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosInstance } from "axios";
import { CanvasConfig } from "./types.js";
import { StudentTools } from "./studentTools.js";
import { tools, Tool } from "./tools/index.js";
import { z } from "zod";

// Handles integration with Canvas LMS through Model Context Protocol
class CanvasServer {
  private server: Server;
  private config: CanvasConfig;
  private axiosInstance: AxiosInstance;
  private studentTools: StudentTools;
  private tools: Tool[];

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

    // Load available tools
    this.tools = tools;

    // Set up request handlers
    this.setupRequestHandlers();
  }

  // Configures handlers for available tools and their execution
  private setupRequestHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      console.error("Received ListToolsRequest");
      return {
        tools: this.tools.map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
        })),
      };
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      console.error(`Received CallToolRequest for: ${name} with args: ${JSON.stringify(args)}`);

      const tool = this.tools.find((t) => t.name === name);
      if (!tool) {
        return {
          error: {
            code: -32601,
            message: `Unknown tool: ${name}`,
          },
        };
      }

      try {
        return await tool.execute(args || {}, {
          axios: this.axiosInstance,
          studentTools: this.studentTools,
        });
      } catch (error) {
        console.error(`Error executing tool '${name}':`, error);
        return {
          error: {
            code: -32000,
            message: error instanceof Error ? `Tool execution failed: ${error.message}` : 'Tool execution failed',
          },
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
- Percentage or count indicators where appropriate`
              }
            }
          ]
        };
      }
      else if (promptName === "summarize-upcoming-week") {
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
      else if (promptName === "check-my-grades") {
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

Please present this information in a straightforward manner that helps me understand my current academic standing.`
              }
            }
          ]
        };
      }
      else if (promptName === "find-lecture-slides") {
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

Please present the results in a clear, organized format that helps me quickly identify the most relevant lecture materials.`
              }
            }
          ]
        };
      }
      else if (promptName === "what-did-i-miss") {
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

Please present this information in a clear, concise format that helps me quickly understand what's been happening in the course and what I need to do next.`
              }
            }
          ]
        };
      }
      
      // If prompt name doesn't match, return an empty messages array
      // This satisfies the schema requirement for a 'messages' property.
      console.error(`Unknown prompt requested: ${promptName}`);
      return {
        messages: [] 
      };
    });
  }

  // Starts the server using stdio transport
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

export { CanvasServer };

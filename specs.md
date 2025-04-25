# Project Specifications: Enhancing canvas-mcp and Building a fast-agent Demo

## 1. Project Objective

The primary objective is to enhance the `r-huijts/canvas-mcp` project to better serve student-centric use cases and demonstrate these enhancements via a proof-of-concept web application using the `fast-agent` framework[cite: 9, 10].

## 2. Target Audience (for Report/Specifications)

Individuals with a technical background (developers, technically proficient educators, advanced students) familiar with TypeScript/Node.js, Python, REST APIs, and basic AI/LLM concepts[cite: 17, 18].

## 3. Core Components

### 3.1. Enhancement of `r-huijts/canvas-mcp` Server (Node.js/TypeScript)

* **Goal:** Adapt the existing MCP server to provide tools and prompts focused on student self-service needs within Canvas LMS[cite: 92].
* **Technology:** Node.js, TypeScript[cite: 21].
* **Architecture:** Function as an MCP Server, configurable via environment variables (`CANVAS_API_TOKEN`, `CANVAS_DOMAIN`)[cite: 21, 22]. Load configuration from `.env` file or client connection[cite: 22].
* **Design Philosophy:** Focus on retrieving information pertinent *only* to the authenticated student user, leveraging user-specific API features (`user_id=self`, `/self/` paths)[cite: 93, 94].

#### 3.1.1. Required New MCP Tools

Implement the following MCP tools, ensuring they fetch data specific to the authenticated student[cite: 95, 96]:

* `get_my_todo_items`: Fetch student's To-Do list (API: `GET /api/v1/users/self/todo`)[cite: 97, 99].
* `get_upcoming_assignments`: Fetch upcoming assignments across active courses (APIs: `GET /api/v1/courses?enrollment_state=active` then loop `GET /api/v1/courses/:id/assignments?bucket=upcoming&include=submission`, or `GET /api/v1/planner/items`; requires server-side aggregation)[cite: 100, 102, 103].
* `get_course_grade`: Fetch student's current overall grade in a specific course (API: `GET /api/v1/courses/:course_id/enrollments?user_id=self`)[cite: 103, 104, 105].
* `get_assignment_details`: Fetch details for a specific assignment including student's submission status/grade/comments (API: `GET /api/v1/courses/:course_id/assignments/:assignment_id?include=submission`)[cite: 106, 107, 109].
* `get_recent_announcements`: Fetch recent announcements (APIs: `GET /api/v1/announcements?context_codes=...` or loop `GET /api/v1/courses/:id/announcements`; requires aggregation/filtering)[cite: 110, 113].
* `list_course_modules`: List modules and items for a course, ideally with student completion status (API: `GET /api/v1/courses/:course_id/modules?include=items&student_id=self`)[cite: 114, 116].
* `find_course_files`: Search files within a course (API: `GET /api/v1/courses/:course_id/files?search_term=<searchTerm>`)[cite: 117, 119].
* `get_unread_discussions`: List unread discussion topics for a course (API: `GET /api/v1/courses/:course_id/discussion_topics?filter_by=unread`)[cite: 121].
* `view_discussion_topic`: Retrieve posts/replies for a discussion topic (API: `GET /api/v1/courses/:course_id/discussion_topics/:topic_id/view`)[cite: 122, 125].
* `get_my_quiz_submission`: Retrieve student's submission details for a quiz (API: `GET /api/v1/courses/:course_id/quizzes/:quiz_id/submissions` filtered for user)[cite: 126, 128].

*(Refer to Table 3 in the source document for detailed parameter and output structure specifications)* [cite: 149, 150]

#### 3.1.2. Required New MCP Prompts

Implement MCP prompts leveraging the new tools[cite: 129]:

* `summarize_upcoming_week`: Summarize assignments/events due soon (Tools: `get_my_todo_items`, `get_upcoming_assignments`)[cite: 130].
* `check_my_grades`: Report current overall grade for specified courses (Tools: `list-courses`, `get_course_grade`)[cite: 131].
* `find_lecture_slides(course_name, topic)`: Find lecture slides/notes (Tools: `list-courses`, `find_course_files`)[cite: 133, 134].
* `what_did_i_miss(course_name)`: Summarize recent course activity (Tools: `list-courses`, `get_recent_announcements`, `get_unread_discussions`)[cite: 135].

#### 3.1.3. Implementation Guidance

* Organize new code in separate modules (e.g., `src/studentTools.ts`)[cite: 137, 138].
* Use or create a central Canvas API client module handling authentication (Bearer token from `CANVAS_API_TOKEN`), base URL construction, and response handling[cite: 139, 140, 141].
* Implement logic within each tool function to call the API, process/filter the response for the specific student, handle errors, and format the output for LLM consumption[cite: 142, 143, 144, 145].
* Implement aggregation logic for tools requiring multi-step API calls[cite: 146].
* Register new tools and prompts with the main MCP server instance[cite: 148].

### 3.2. `fast-agent` Web Application Demo (Python)

* **Goal:** Demonstrate the enhanced `canvas-mcp` server via a web interface[cite: 151].
* **Framework:** Use `fast-agent` (Python) for the AI agent layer[cite: 153].
* **Architecture:** [cite: 155]
    * **Frontend:** Simple HTML/JavaScript UI or Streamlit/Gradio[cite: 155, 156].
    * **Backend API:** Lightweight Python server (FastAPI/Flask)[cite: 157].
    * **Agent Layer:** `fast-agent` agent configured for Canvas student assistance[cite: 159].
    * **MCP Integration:** `fast-agent` connects to the running `canvas-mcp` server (likely via stdio)[cite: 160, 161, 171, 173, 174]. `fast-agent` configuration must pass `CANVAS_API_TOKEN` and `CANVAS_DOMAIN` environment variables to the server process[cite: 175, 182].
* **Authentication (Demo Only - Insecure):**
    * Use a static, user-provided `CANVAS_API_TOKEN`[cite: 178].
    * **CRITICAL WARNING:** This method is highly insecure and suitable *only* for local, temporary demonstration[cite: 184, 185, 224, 256].
    * The token MUST be stored as an environment variable on the backend server ONLY[cite: 180, 181].
    * It MUST be passed securely from the backend process to the `canvas-mcp` process via the `fast-agent` configuration (e.g., environment variable pass-through during stdio launch)[cite: 182, 183].
    * **DO NOT** embed the token in code or expose it to the frontend[cite: 181].
    * Delete the token from Canvas after the demo[cite: 231, 260].

## 4. Key Considerations and Alternatives

* **Security:** The static token approach is the primary security vulnerability[cite: 178, 224]. For any real application, use OAuth2 with scoped Developer Keys [cite: 232, 235, 260, 265] or LTI 1.3[cite: 261].
* **LTI 1.3:** Strongly consider Learning Tools Interoperability (LTI) 1.3 as the standard, more secure, and context-aware integration method for student-facing tools in Canvas[cite: 196, 207, 211, 222, 262]. LTI provides secure authentication and context, eliminating the need for static tokens[cite: 198, 211].
* **Student Data Privacy (FERPA):** Ensure compliance with FERPA regulations when handling student data[cite: 236, 237, 265]. Implement data minimization and secure handling practices[cite: 241].
* **AI Bias:** Be aware of potential AI bias in interpreting queries or summarizing information. Use careful prompt engineering and focus on objective data presentation[cite: 244, 247, 250, 265].

## 5. Recommendations for Implementation

* Prioritize implementing 1-2 high-impact student tools first (e.g., `get_my_todo_items`, `get_course_grade`)[cite: 257].
* Develop the demo strictly locally[cite: 258]. Handle the static token with extreme care if used[cite: 259].
* Strongly evaluate and prefer LTI 1.3 or OAuth2 with Developer Keys for any deployment beyond personal, local testing[cite: 260, 261, 262].
$500 Bounty Add-On (Not Completed)
Customer

Target user: small portfolio analyst or advisor using Ghostfolio.

Main Feature

A simple workflow demonstrating agent-powered portfolio analysis:

User uploads sample portfolio data.

User asks the agent to analyze the uploaded portfolio.

User continues with follow-up questions in the same conversation.

Data Source

User-uploaded sample portfolio dataset

Connected through backend services and used as context for agent responses.

Stateful Data & CRUD

Uploaded portfolio data remains tied to the user workflow.

Read: Agent analyzes uploaded portfolio data

Update: User modifies data and requests re-analysis

Delete: Sample data can be removed or cleaned up

Agent Access
POST /api/v1/gauntlet-agent/chat/stream
Sample Tryout

Upload sample portfolio data

Ask: “Analyze my portfolio”

Ask follow-up questions

The agent responds using uploaded data while preserving conversation context.

Impact

This showcase demonstrates:

Sample data upload + analysis flow

Stateful conversational agent behavior

Practical portfolio support inside the application
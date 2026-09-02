/** Exposes versioned task resources while delegating all behavior to application use cases. */
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ApiErrorResponseDto } from '../../common/presentation/api-error-response.dto.js';
import { RequirePermission } from '../../authorization/public/require-permission.decorator.js';
import { RequireDemoIdentity } from '../../identity/public/require-demo-identity.decorator.js';
import { ActOnTask } from '../application/use-cases/act-on-task.js';
import { AddTaskComment } from '../application/use-cases/add-task-comment.js';
import { CreateTask } from '../application/use-cases/create-task.js';
import { DeleteTaskComment } from '../application/use-cases/delete-task-comment.js';
import { GetTask } from '../application/use-cases/get-task.js';
import { ListTasks } from '../application/use-cases/list-tasks.js';
import { RenewExpiredTask } from '../application/use-cases/renew-expired-task.js';
import { ActTaskDto } from './dto/act-task.dto.js';
import {
  AddTaskCommentDto,
  DeleteTaskCommentDto,
} from './dto/comment-task.dto.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { RenewExpiredTaskDto } from './dto/renew-expired-task.dto.js';
import { TaskResponseDto, toTaskResponse } from './dto/task-response.dto.js';

@ApiTags('tasks')
@Controller({ path: 'tasks', version: '1' })
export class TasksController {
  /** Receives the explicit command and query use cases used by this HTTP adapter. */
  constructor(
    private readonly listTasks: ListTasks,
    private readonly getTask: GetTask,
    private readonly createTask: CreateTask,
    private readonly actOnTask: ActOnTask,
    private readonly addTaskComment: AddTaskComment,
    private readonly deleteTaskComment: DeleteTaskComment,
    private readonly renewExpiredTask: RenewExpiredTask,
  ) {}

  /** Lists all task projections for client-side filtering and statistics. */
  @Get()
  @ApiSecurity('demo-user')
  @ApiHeader({ name: 'X-Demo-User-Id', required: true })
  @ApiOkResponse({ type: [TaskResponseDto] })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @RequirePermission('tasks.view')
  async list(
    @Headers('x-demo-user-id') actorId: string,
  ): Promise<TaskResponseDto[]> {
    return (await this.listTasks.execute(actorId)).map(toTaskResponse);
  }

  /** Returns one complete task projection including its ordered timeline. */
  @Get(':taskId')
  @ApiSecurity('demo-user')
  @ApiHeader({ name: 'X-Demo-User-Id', required: true })
  @ApiOkResponse({ type: TaskResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @RequirePermission('tasks.view')
  async get(
    @Headers('x-demo-user-id') actorId: string,
    @Param('taskId') taskId: string,
  ): Promise<TaskResponseDto> {
    return toTaskResponse(await this.getTask.execute(taskId, actorId));
  }

  /** Creates a task as the recognized demo actor from the request header. */
  @Post()
  @RequireDemoIdentity()
  @ApiSecurity('demo-user')
  @ApiHeader({ name: 'X-Demo-User-Id', required: true })
  @ApiCreatedResponse({ type: TaskResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  async create(
    @Headers('x-demo-user-id') actorId: string,
    @Body() body: CreateTaskDto,
  ): Promise<TaskResponseDto> {
    return toTaskResponse(await this.createTask.execute(actorId, body));
  }

  /** Appends one optimistic comment and returns the freshly synchronized projection. */
  @Post(':taskId/comments')
  @HttpCode(200)
  @RequirePermission('tasks.view')
  @ApiSecurity('demo-user')
  @ApiHeader({ name: 'X-Demo-User-Id', required: true })
  @ApiOkResponse({ type: TaskResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  async addComment(
    @Headers('x-demo-user-id') actorId: string,
    @Param('taskId') taskId: string,
    @Body() body: AddTaskCommentDto,
  ): Promise<TaskResponseDto> {
    return toTaskResponse(
      await this.addTaskComment.execute(
        actorId,
        taskId,
        body.content,
        body.expectedVersion,
      ),
    );
  }

  /** Appends one optimistic comment tombstone and returns the latest projection. */
  @Delete(':taskId/comments/:commentId')
  @HttpCode(200)
  @RequirePermission('tasks.view')
  @ApiSecurity('demo-user')
  @ApiHeader({ name: 'X-Demo-User-Id', required: true })
  @ApiOkResponse({ type: TaskResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  async deleteComment(
    @Headers('x-demo-user-id') actorId: string,
    @Param('taskId') taskId: string,
    @Param('commentId') commentId: string,
    @Body() body: DeleteTaskCommentDto,
  ): Promise<TaskResponseDto> {
    return toTaskResponse(
      await this.deleteTaskComment.execute(
        actorId,
        taskId,
        commentId,
        body.expectedVersion,
      ),
    );
  }

  /** Applies one optimistic task action and returns the freshly synchronized projection. */
  @Post(':taskId/actions')
  @HttpCode(200)
  @RequireDemoIdentity()
  @ApiSecurity('demo-user')
  @ApiHeader({ name: 'X-Demo-User-Id', required: true })
  @ApiOkResponse({ type: TaskResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  async act(
    @Headers('x-demo-user-id') actorId: string,
    @Param('taskId') taskId: string,
    @Body() body: ActTaskDto,
  ): Promise<TaskResponseDto> {
    await this.actOnTask.execute(
      actorId,
      taskId,
      body.action,
      body.expectedVersion,
    );
    return toTaskResponse(await this.getTask.execute(taskId, actorId));
  }

  /** Renews one expired task and returns the freshly synchronized projection. */
  @Post(':taskId/expiration-renewal')
  @HttpCode(200)
  @RequireDemoIdentity()
  @ApiSecurity('demo-user')
  @ApiHeader({ name: 'X-Demo-User-Id', required: true })
  @ApiOkResponse({ type: TaskResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto })
  @ApiNotFoundResponse({ type: ApiErrorResponseDto })
  @ApiConflictResponse({ type: ApiErrorResponseDto })
  async renewExpired(
    @Headers('x-demo-user-id') actorId: string,
    @Param('taskId') taskId: string,
    @Body() body: RenewExpiredTaskDto,
  ): Promise<TaskResponseDto> {
    await this.renewExpiredTask.execute(actorId, taskId, body);
    return toTaskResponse(await this.getTask.execute(taskId, actorId));
  }
}

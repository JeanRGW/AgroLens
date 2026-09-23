import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard, type AuthenticatedUser } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ZodValidationPipe } from '../auth/pipes/zod-validation.pipe';
import { createUserSchema, type CreateUserDto } from './dto/create-user.dto';
import { updateProfileSchema, type UpdateProfileDto } from './dto/update-profile.dto';
import { updateRoleSchema, type UpdateRoleDto } from './dto/update-role.dto';
import { resetPasswordSchema, type ResetPasswordDto } from './dto/reset-password.dto';
import { setDisabledSchema, type SetDisabledDto } from './dto/set-disabled.dto';
import { lookupQuerySchema, type LookupQueryDto } from './dto/lookup-query.dto';
import { listUsersQuerySchema, type ListUsersQueryDto } from './dto/list-users-query.dto';

const ADMIN_CREATE_USER_BODY = {
  type: 'object',
  required: ['email', 'password', 'fullName'],
  properties: {
    email: { type: 'string', format: 'email', example: 'user@example.com' },
    password: { type: 'string', minLength: 8, maxLength: 128, example: 'securepassword' },
    fullName: { type: 'string', minLength: 1, maxLength: 200, example: 'Joao Silva' },
    phone: { type: 'string', maxLength: 30, example: '+5511999999999' },
    role: { type: 'string', enum: ['admin', 'user'], default: 'user' },
  },
};

const UPDATE_PROFILE_BODY = {
  type: 'object',
  properties: {
    fullName: { type: 'string', minLength: 1, maxLength: 200, example: 'Joao Silva' },
    phone: { type: 'string', maxLength: 30, nullable: true, example: '+5511999999999' },
  },
};

const UPDATE_ROLE_BODY = {
  type: 'object',
  required: ['role'],
  properties: {
    role: { type: 'string', enum: ['admin', 'user'], example: 'admin' },
  },
};

const RESET_PASSWORD_BODY = {
  type: 'object',
  required: ['newPassword'],
  properties: {
    newPassword: {
      type: 'string',
      minLength: 8,
      maxLength: 128,
      example: 'new-secure-password',
    },
  },
};

const SET_DISABLED_BODY = {
  type: 'object',
  required: ['disabled'],
  properties: {
    disabled: { type: 'boolean', example: true },
  },
};

@ApiTags('Users')
@ApiBearerAuth()
@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ── GET /users — admin-only user listing ────────────────────────

  @Get('users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'List users with optional filters (admin only)' })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Filter by email or full name (case-insensitive)',
  })
  @ApiQuery({
    name: 'role',
    required: false,
    enum: ['admin', 'user'],
    description: 'Filter by role',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default 1)' })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    type: Number,
    description: 'Page size (default 50, max 100)',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of users without sensitive fields' })
  @ApiResponse({ status: 403, description: 'Forbidden — requires admin role' })
  async listUsers(@Query(new ZodValidationPipe(listUsersQuerySchema)) query: ListUsersQueryDto) {
    return this.usersService.listUsers(query);
  }

  // ── GET /users/lookup — authenticated user search ──────────────

  @Get('users/lookup')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Search users (authenticated)',
    description:
      'Admins can search by email or name and receive sanitized user records. ' +
      'Other users can search only by name and receive { id, fullName }.',
  })
  @ApiQuery({
    name: 'q',
    required: true,
    type: String,
    description: 'Search query (partial name, or email for admins)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Max results (1-100, default 20)',
  })
  @ApiResponse({
    status: 200,
    description: 'Matching users, projected according to the caller role',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — authentication required' })
  async lookupUsers(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query(new ZodValidationPipe(lookupQuerySchema)) query: LookupQueryDto,
  ) {
    const users = await this.usersService.lookup(currentUser, query.q, query.limit);
    return { users };
  }

  // ── GET /users/:id — authenticated get user by ID ───────────────

  @Get('users/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get user by ID (authenticated)',
    description:
      'Admins receive sanitized user record including email. ' +
      'Other users receive { id, fullName }.',
  })
  @ApiResponse({ status: 200, description: 'User found' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized — authentication required' })
  async getUserById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    const user = await this.usersService.getUserById(id, currentUser);
    return { user };
  }

  // ── POST /admin/users — admin creates user ─────────────────────

  @Post('admin/users')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Admin creates a user with email/password and role' })
  @ApiBody({ schema: ADMIN_CREATE_USER_BODY })
  @ApiResponse({ status: 201, description: 'User created' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  @ApiResponse({ status: 403, description: 'Forbidden — requires admin role' })
  async adminCreateUser(@Body(new ZodValidationPipe(createUserSchema)) dto: CreateUserDto) {
    const user = await this.usersService.adminCreateUser(dto);
    return { user };
  }

  // ── PATCH /users/me — update own profile ───────────────────────

  @Patch('users/me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update current user profile (fullName, phone)' })
  @ApiBody({ schema: UPDATE_PROFILE_BODY })
  @ApiResponse({ status: 200, description: 'Profile updated' })
  @ApiResponse({ status: 400, description: 'No valid fields to update' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  async updateMyProfile(
    @Body(new ZodValidationPipe(updateProfileSchema)) dto: UpdateProfileDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    const user = await this.usersService.updateMyProfile(currentUser, dto);
    return { user };
  }

  // ── PATCH /admin/users/:id/role ────────────────────────────────

  @Patch('admin/users/:id/role')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Change a user role (admin only). Audits the change.' })
  @ApiBody({ schema: UPDATE_ROLE_BODY })
  @ApiResponse({ status: 200, description: 'Role updated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — requires admin role' })
  async adminChangeRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateRoleSchema)) dto: UpdateRoleDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    const user = await this.usersService.adminChangeRole(id, dto, currentUser);
    return { user };
  }

  // ── PATCH /admin/users/:id/disabled ─────────────────────────────

  @Patch('admin/users/:id/disabled')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({
    summary: 'Disable or re-enable a user (admin only). Audited; revokes sessions.',
    description:
      'Suspends a compromised student account or reactivates it. Disabling ' +
      'revokes all refresh sessions; the user must sign in again after re-enable. ' +
      'Self-disable and disabling the last active admin are rejected.',
  })
  @ApiBody({ schema: SET_DISABLED_BODY })
  @ApiResponse({ status: 200, description: 'Disabled status updated' })
  @ApiResponse({ status: 400, description: 'Invalid payload' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — requires admin role' })
  async adminSetDisabled(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setDisabledSchema)) dto: SetDisabledDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    const user = await this.usersService.adminSetDisabled(id, dto, currentUser);
    return { user };
  }

  // ── POST /admin/users/:id/reset-password ───────────────────────

  @Post('admin/users/:id/reset-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({
    summary: 'Reset a user password (admin only). Revokes all of their sessions.',
  })
  @ApiBody({ schema: RESET_PASSWORD_BODY })
  @ApiResponse({ status: 200, description: 'Password reset; user sessions revoked' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 403, description: 'Forbidden — requires admin role' })
  async adminResetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(resetPasswordSchema)) dto: ResetPasswordDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ) {
    const user = await this.usersService.adminResetPassword(id, dto, currentUser);
    return { user };
  }
}

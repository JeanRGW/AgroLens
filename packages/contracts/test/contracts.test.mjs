import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  pageParamsSchema,
  paginatedResponseSchema,
  timestampDateSchema,
  timestampStringSchema,
  loginSchema,
  registerSchema,
  createPropertySchema,
  uploadInitSchema,
  yoloLabelSchema,
  createGrantSchema,
  listGrantsQuerySchema,
  listAuditQuerySchema,
  createJobSchema,
  createUserSchema,
  listUsersQuerySchema,
} from "../dist/index.js";

describe("Contracts Schema Validation", () => {
  test("pageParamsSchema applies defaults and validates limits", () => {
    const defaults = pageParamsSchema.parse({});
    assert.equal(defaults.limit, 20);
    assert.equal(defaults.offset, 0);

    const custom = pageParamsSchema.parse({ limit: "50", offset: "10" });
    assert.equal(custom.limit, 50);
    assert.equal(custom.offset, 10);

    assert.throws(() => pageParamsSchema.parse({ limit: 0 }));
    assert.throws(() => pageParamsSchema.parse({ limit: 150 }));
    assert.throws(() => pageParamsSchema.parse({ offset: -1 }));
  });

  test("paginatedResponseSchema validates envelope", () => {
    const stringListSchema = paginatedResponseSchema(pageParamsSchema);
    const valid = stringListSchema.parse({
      items: [{ limit: 20, offset: 0 }],
      total: 1,
    });
    assert.equal(valid.items.length, 1);
    assert.equal(valid.total, 1);
  });

  test("timestamp schemas enforce timezone-qualified ISO-8601", () => {
    const validUtc = "2025-06-15T10:00:00Z";
    const validOffset = "2025-06-15T10:00:00-03:00";
    const naive = "2025-06-15T10:00:00";

    assert.equal(timestampStringSchema.parse(validUtc), validUtc);
    assert.equal(timestampStringSchema.parse(validOffset), validOffset);
    assert.throws(() => timestampStringSchema.parse(naive));

    const parsedDate = timestampDateSchema.parse(validUtc);
    assert.ok(parsedDate instanceof Date);
    assert.equal(parsedDate.toISOString(), "2025-06-15T10:00:00.000Z");
  });

  test("auth schemas validate input constraints", () => {
    assert.throws(() =>
      loginSchema.parse({ email: "invalid-email", password: "" }),
    );

    const validLogin = loginSchema.parse({
      email: "user@example.com",
      password: "mypassword123",
    });
    assert.equal(validLogin.clientType, "web");

    // Register password rules: min 8 characters
    assert.throws(() =>
      registerSchema.parse({
        email: "user@example.com",
        fullName: "Test User",
        password: "123",
      }),
    );
  });

  test("catalog schemas validate coordinates and fields", () => {
    assert.throws(() =>
      createPropertySchema.parse({
        name: "Fazenda",
        owner: "Owner",
        address: "Addr",
        latitude: 95,
        longitude: 0,
      }),
    );

    const validProp = createPropertySchema.parse({
      name: "Fazenda Santa Maria",
      owner: "Joao",
      address: "Rodovia SP-340",
      latitude: -22.9,
      longitude: -43.1,
    });
    assert.equal(validProp.name, "Fazenda Santa Maria");
  });

  test("uploadInitSchema validates UUIDs and files array", () => {
    const valid = uploadInitSchema.parse({
      clientUploadId: "upload-uuid-1",
      propertyId: "a0000000-0000-0000-0000-000000000001",
      talhaoId: "a0000000-0000-0000-0000-000000000002",
      cropTypeId: "a0000000-0000-0000-0000-000000000003",
      source: "phone",
      activityDate: "2026-01-01T12:00:00Z",
      files: [
        {
          imageId: "a0000000-0000-4000-8000-000000000001",
          contentType: "image/jpeg",
          sizeBytes: 1024,
          latitude: -23.5,
          longitude: -46.6,
        },
      ],
    });
    assert.equal(valid.files.length, 1);
    assert.ok(valid.activityDate instanceof Date);
    assert.equal(
      uploadInitSchema.safeParse({
        ...valid,
        activityDate: valid.activityDate.toISOString(),
        files: [
          {
            imageId: valid.files[0].imageId,
            contentType: "image/jpeg",
            latitude: null,
            longitude: null,
          },
        ],
      }).success,
      true,
    );
    assert.equal(
      uploadInitSchema.safeParse({
        ...valid,
        activityDate: valid.activityDate.toISOString(),
        files: [
          {
            imageId: valid.files[0].imageId,
            contentType: "image/jpeg",
            latitude: null,
            longitude: -46.6,
          },
        ],
      }).success,
      false,
    );
    assert.equal(
      uploadInitSchema.safeParse({
        ...valid,
        files: [valid.files[0], valid.files[0]],
      }).success,
      false,
    );
  });

  test("yoloLabelSchema validates bounding box ranges 0..1", () => {
    const valid = yoloLabelSchema.parse({
      classId: 0,
      className: "rust",
      xCenter: 0.5,
      yCenter: 0.5,
      width: 0.2,
      height: 0.2,
    });
    assert.equal(valid.className, "rust");

    assert.throws(() =>
      yoloLabelSchema.parse({
        classId: 0,
        className: "rust",
        xCenter: 1.5,
        yCenter: 0.5,
        width: 0.2,
        height: 0.2,
      }),
    );
  });

  test("createGrantSchema enforces resource types and UUIDs", () => {
    assert.throws(() =>
      createGrantSchema.parse({
        subjectUserId: "123",
        resourceType: "invalid_type",
        resourceId: "456",
      }),
    );

    const valid = createGrantSchema.parse({
      subjectUserId: "a0000000-0000-0000-0000-000000000001",
      resourceType: "upload",
      resourceId: "a0000000-0000-0000-0000-000000000002",
    });
    assert.deepEqual(valid.actions, ["read"]);
  });

  test("pagination normalization in list queries", () => {
    // List grants with legacy page/pageSize
    const grantsQuery = listGrantsQuerySchema.parse({
      page: "2",
      pageSize: "15",
    });
    assert.equal(grantsQuery.limit, 15);
    assert.equal(grantsQuery.offset, 15);

    // List users with legacy page/pageSize
    const usersQuery = listUsersQuerySchema.parse({
      page: "3",
      pageSize: "10",
    });
    assert.equal(usersQuery.limit, 10);
    assert.equal(usersQuery.offset, 20);

    // List audit with legacy page/pageSize
    const auditQuery = listAuditQuerySchema.parse({
      page: "1",
      pageSize: "50",
    });
    assert.equal(auditQuery.limit, 50);
    assert.equal(auditQuery.offset, 0);
  });

  test("list queries default limits and prefer explicit limit/offset", () => {
    // Domain defaults: users 50, grants 50, audit 100
    assert.equal(listUsersQuerySchema.parse({}).limit, 50);
    assert.equal(listGrantsQuerySchema.parse({}).limit, 50);
    assert.equal(listAuditQuerySchema.parse({}).limit, 100);
    assert.equal(listUsersQuerySchema.parse({}).offset, 0);

    // Explicit limit/offset wins over page/pageSize
    const explicit = listUsersQuerySchema.parse({
      limit: "10",
      offset: "5",
      page: "3",
      pageSize: "25",
    });
    assert.equal(explicit.limit, 10);
    assert.equal(explicit.offset, 5);

    // page/pageSize echo follows the resolved window
    const echoed = listGrantsQuerySchema.parse({ page: "2", pageSize: "15" });
    assert.equal(echoed.page, 2);
    assert.equal(echoed.pageSize, 15);
  });

  test("createJobSchema enforces uploadId XOR files", () => {
    const modelId = "a0000000-0000-0000-0000-000000000001";
    const uploadId = "a0000000-0000-0000-0000-000000000002";

    // Valid upload-sourced job
    const jobWithUpload = createJobSchema.parse({
      modelId,
      uploadId,
    });
    assert.equal(jobWithUpload.uploadId, uploadId);

    // Valid temporary files job
    const jobWithFiles = createJobSchema.parse({
      modelId,
      files: [
        { fileName: "img.jpg", contentType: "image/jpeg", sizeBytes: 500 },
      ],
    });
    assert.equal(jobWithFiles.files?.length, 1);

    // Both provided should fail
    assert.throws(() =>
      createJobSchema.parse({
        modelId,
        uploadId,
        files: [
          { fileName: "img.jpg", contentType: "image/jpeg", sizeBytes: 500 },
        ],
      }),
    );

    // Neither provided should fail
    assert.throws(() =>
      createJobSchema.parse({
        modelId,
      }),
    );
  });

  test("createUserSchema validates admin user creation", () => {
    const user = createUserSchema.parse({
      email: "admin@agrolens.org",
      password: "secureadminpassword123",
      fullName: "AgroLens Admin",
      role: "admin",
    });
    assert.equal(user.role, "admin");
  });
});

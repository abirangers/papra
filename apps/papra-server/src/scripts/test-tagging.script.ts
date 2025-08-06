import { createOrganizationsRepository } from '../modules/organizations/organizations.repository';
import { createUsersRepository } from '../modules/users/users.repository';
import { createTagsRepository } from '../modules/tags/tags.repository';
import { createTaggingRulesRepository } from '../modules/tagging-rules/tagging-rules.repository';
import { createDocumentsRepository } from '../modules/documents/documents.repository';
import { extractAndSaveDocumentFileContent } from '../modules/documents/documents.usecases';
import { createDocumentStorageService } from '../modules/documents/storage/documents.storage.services';
import { generateDocumentId } from '../modules/documents/documents.models';
import { runScript } from './commons/run-script';
import { randomUUID } from 'crypto';
import assert from 'node:assert';

runScript({ scriptName: 'test-tagging' }, async ({ db, config, logger }) => {
  logger.info('Setting up repositories and services...');
  const organizationsRepository = createOrganizationsRepository({ db });
  const usersRepository = createUsersRepository({ db });
  const tagsRepository = createTagsRepository({ db });
  const taggingRulesRepository = createTaggingRulesRepository({ db });
  const documentsRepository = createDocumentsRepository({ db });
  const documentsStorageService = await createDocumentStorageService({ config });


  logger.info('Creating test data...');

  // 1. Create User and Organization
  const { user } = await usersRepository.createUser({
    email: `test-user-${randomUUID()}@papra.com`,
    name: 'Test User',
    password: 'password123',
  });

  const { organization } = await organizationsRepository.createOrganization({
    name: 'Test Organization',
    ownerId: user.id,
  });

  // 2. Enable AI Tagging for the organization
  await organizationsRepository.updateOrganization({
    organizationId: organization.id,
    aiTaggingEnabled: true,
  });
  logger.info({ organizationId: organization.id }, 'AI tagging enabled for organization.');


  // 3. Create a tag
  const { tags: [tag] } = await tagsRepository.createManyTags({
    tags: [{ name: 'invoice', color: '#ff0000', organizationId: organization.id }],
  });
  logger.info({ tagName: tag.name }, 'Test tag created.');

  // 4. Create a tagging rule
  await taggingRulesRepository.createTaggingRuleWithConditionsAndActions({
    taggingRule: {
      name: 'Invoice Rule',
      organizationId: organization.id,
      enabled: true,
    },
    conditions: [{
      field: 'content',
      operator: 'contains',
      value: 'invoice',
      isCaseSensitive: false,
    }],
    tagIds: [tag.id],
  });
  logger.info('Tagging rule created: if content contains "invoice", add "invoice" tag.');

  // 5. Simulate file upload by creating the document directly
  const fileContent = 'This is a test invoice document.';
  const fileName = 'my-test-invoice.txt';
  const file = new File([fileContent], fileName, { type: 'text/plain' });

  const documentId = generateDocumentId();
  const { storageKey } = await documentsStorageService.saveFile({
    file,
    storageKey: `${organization.id}/${documentId}/${fileName}`,
  });
  await documentsRepository.saveOrganizationDocument({
    id: documentId,
    name: fileName,
    organizationId: organization.id,
    originalName: fileName,
    createdBy: user.id,
    originalSize: file.size,
    originalStorageKey: storageKey,
    mimeType: file.type,
    originalSha256Hash: 'dummy-hash-since-we-are-skipping-this-part',
  });
  logger.info({ documentId }, 'Document created directly in the database.');

  // DEBUG: Check if document exists right after creation
  const { document: docBeforeUpdate } = await documentsRepository.getDocumentById({ documentId, organizationId: organization.id });
  assert(docBeforeUpdate, 'DEBUG_FAIL: Document should exist right after saving!');
  logger.info('✅ DEBUG_PASS: Document exists in DB before calling use case.');


  // 6. Directly call the use case that the background job would run
  logger.info({ documentId }, 'Directly calling extractAndSaveDocumentFileContent...');
  await extractAndSaveDocumentFileContent({
    documentId,
    organizationId: organization.id,
    documentsRepository,
    documentsStorageService,
    config,
    tagsRepository,
    taggingRulesRepository,
    organizationsRepository,
  });
  logger.info('extractAndSaveDocumentFileContent finished.');


  // 7. Verify the results
  logger.info('Verifying results...');
  const { document: finalDocument } = await documentsRepository.getDocumentById({ documentId, organizationId: organization.id });

  assert(finalDocument, 'Document should exist');
  assert.strictEqual(finalDocument.content, fileContent, 'Document content should have been extracted.');
  logger.info('✅ Document content was extracted correctly.');

  const { documentTags } = await tagsRepository.getDocumentTags({ documentId });
  const appliedTag = documentTags.find(dt => dt.tagId === tag.id);
  assert(appliedTag, 'The "invoice" tag should have been applied by the rule.');
  logger.info('✅ Rule-based tag was applied successfully.');

  logger.info('Verification complete. The script will now check the server logs for AI tagging results.');
});

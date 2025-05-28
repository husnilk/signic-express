const request = require('supertest');
const app = require('../index'); // Assuming index.js exports the app
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

// Mock Prisma Client
jest.mock('@prisma/client', () => {
  const mPrismaClient = {
    document: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(), // For pagination if you implement it fully in tests
    },
  };
  return { PrismaClient: jest.fn(() => mPrismaClient) };
});

// Mock fs module
jest.mock('fs');

// Mock authMiddleware
// This mock simulates an authenticated user by adding req.user
jest.mock('../authMiddleware', () => jest.fn((req, res, next) => {
  req.user = { id: 1, email: 'test@example.com' }; // Mock user object
  next();
}));

// Mock multer's upload.single middleware for file uploads
// This is a simplified mock. For more complex scenarios, you might need a more detailed mock.
jest.mock('multer', () => {
    const multer = () => ({
        single: jest.fn().mockImplementation((fieldName) => (req, res, next) => {
            // Simulate file upload: add req.file
            if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
                req.file = {
                    originalname: 'testfile.pdf',
                    filename: 'mocked_filename_123.pdf',
                    path: path.join(__dirname, '..', 'uploads', 'mocked_filename_123.pdf'),
                    size: 12345,
                };
                 // Multer also typically processes body fields from multipart/form-data
                // For simplicity, we assume body fields are directly available or set by supertest .field()
            }
            next();
        }),
    });
    // Mock specific properties if needed, e.g., multer.diskStorage
    multer.diskStorage = jest.fn(() => ({}));
    return multer;
});


const prisma = new PrismaClient();

describe('Document API Endpoints', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/documents (Upload Document)', () => {
    it('should upload a document successfully', async () => {
      const mockDocumentData = {
        title: 'Test Document',
        description: 'This is a test document.',
        owner_id: '2', // Assuming owner_id is a string from form data
      };
      const expectedUploadedDoc = {
        id: 'mock-uuid-123',
        ...mockDocumentData,
        owner_id: 2, // after parseInt
        uploader_id: 1, // from mockAuthMiddleware
        original_filename: 'testfile.pdf',
        stored_filename: 'mocked_filename_123.pdf',
        storage_path: path.join(__dirname, '..', 'uploads', 'mocked_filename_123.pdf'),
        filesize: 12345,
        status: 'uploaded',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      prisma.document.create.mockResolvedValue(expectedUploadedDoc);

      const response = await request(app)
        .post('/api/documents')
        .field('title', mockDocumentData.title)
        .field('description', mockDocumentData.description)
        .field('owner_id', mockDocumentData.owner_id)
        .attach('document', Buffer.from('dummy file content'), 'testfile.pdf'); // 'document' is the field name

      expect(response.status).toBe(201);
      expect(response.body.title).toBe(mockDocumentData.title);
      expect(prisma.document.create).toHaveBeenCalledWith({
        data: {
          title: mockDocumentData.title,
          description: mockDocumentData.description,
          uploader_id: 1, // from mocked authMiddleware
          owner_id: 2,    // parseInt(mockDocumentData.owner_id)
          original_filename: 'testfile.pdf',
          stored_filename: 'mocked_filename_123.pdf',
          storage_path: path.join(__dirname, '..', 'uploads', 'mocked_filename_123.pdf'),
          filesize: 12345,
          status: 'uploaded',
        },
      });
    });

    it('should return 400 if title is missing', async () => {
      fs.unlinkSync.mockImplementation(() => {}); // Mock fs.unlinkSync to avoid errors during cleanup

      const response = await request(app)
        .post('/api/documents')
        .field('description', 'This is a test document.')
        .field('owner_id', '2')
        .attach('document', Buffer.from('dummy file content'), 'testfile.pdf');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Missing required fields');
      expect(fs.unlinkSync).toHaveBeenCalled(); // Ensure uploaded file is deleted
    });

     it('should return 400 if owner_id is missing', async () => {
      fs.unlinkSync.mockImplementation(() => {});

      const response = await request(app)
        .post('/api/documents')
        .field('title', 'Test Document')
        .attach('document', Buffer.from('dummy file content'), 'testfile.pdf');
      
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Missing required fields');
      expect(fs.unlinkSync).toHaveBeenCalled();
    });

    it('should return 400 if no file is uploaded', async () => {
      const response = await request(app)
        .post('/api/documents')
        .field('title', 'Test Document')
        .field('description', 'This is a test document.')
        .field('owner_id', '2');
        // No .attach() call

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('No file uploaded.');
    });
  });

  describe('GET /api/documents (List Documents)', () => {
    it('should return a list of documents', async () => {
      const mockDocuments = [
        { id: '1', title: 'Doc 1', uploader_id: 1, owner_id: 1 },
        { id: '2', title: 'Doc 2', uploader_id: 1, owner_id: 2 },
      ];
      prisma.document.findMany.mockResolvedValue(mockDocuments);

      const response = await request(app).get('/api/documents');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockDocuments);
      expect(prisma.document.findMany).toHaveBeenCalledWith({
        skip: undefined,
        take: undefined,
      });
    });

    it('should return a paginated list of documents', async () => {
        const mockDocuments = [{ id: '3', title: 'Doc 3' }];
        prisma.document.findMany.mockResolvedValue(mockDocuments);

        const response = await request(app).get('/api/documents?skip=5&take=10');
        expect(response.status).toBe(200);
        expect(response.body).toEqual(mockDocuments);
        expect(prisma.document.findMany).toHaveBeenCalledWith({
            skip: 5,
            take: 10,
        });
    });

    it('should return an empty list if no documents exist', async () => {
      prisma.document.findMany.mockResolvedValue([]);
      const response = await request(app).get('/api/documents');
      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });
  });

  describe('GET /api/documents/:id (Get Document by ID)', () => {
    it('should return a document if found', async () => {
      const mockDocument = { id: 'doc-xyz', title: 'Specific Doc', uploader_id: 1, owner_id: 1 };
      prisma.document.findUnique.mockResolvedValue(mockDocument);

      const response = await request(app).get('/api/documents/doc-xyz');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockDocument);
      expect(prisma.document.findUnique).toHaveBeenCalledWith({ where: { id: 'doc-xyz' } });
    });

    it('should return 404 if document not found', async () => {
      prisma.document.findUnique.mockResolvedValue(null);
      const response = await request(app).get('/api/documents/nonexistent');
      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Document not found.');
    });
  });

  describe('PUT /api/documents/:id (Update Document)', () => {
    it('should update a document successfully', async () => {
      const updateData = { title: 'Updated Title', description: 'Updated Desc', owner_id: '3', status: 'reviewed' };
      const mockUpdatedDocument = { 
          id: 'doc-abc', 
          title: 'Updated Title', 
          description: 'Updated Desc', 
          owner_id: 3, // after parseInt
          status: 'reviewed',
          uploader_id: 1 
      };
      // prisma.document.findUnique.mockResolvedValue({ id: 'doc-abc', title: 'Old Title', uploader_id: 1, owner_id: 1 }); // Mock that doc exists
      prisma.document.update.mockResolvedValue(mockUpdatedDocument);

      const response = await request(app)
        .put('/api/documents/doc-abc')
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.title).toBe(updateData.title);
      expect(prisma.document.update).toHaveBeenCalledWith({
        where: { id: 'doc-abc' },
        data: { title: updateData.title, description: updateData.description, owner_id: 3, status: updateData.status },
      });
    });

    it('should return 404 if document to update not found', async () => {
      prisma.document.update.mockRejectedValue({ code: 'P2025' }); // Simulate Prisma record not found error

      const response = await request(app)
        .put('/api/documents/nonexistent')
        .send({ title: 'New Title' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Document not found.');
    });
  });

  describe('DELETE /api/documents/:id (Delete Document)', () => {
    it('should delete a document successfully', async () => {
      const mockDocument = {
        id: 'doc-to-delete',
        title: 'To Be Deleted',
        storage_path: path.join(__dirname, '..', 'uploads', 'file_to_delete.pdf'),
        uploader_id: 1,
        owner_id: 1,
      };
      prisma.document.findUnique.mockResolvedValue(mockDocument);
      prisma.document.delete.mockResolvedValue(mockDocument); // Or simply {}
      fs.existsSync.mockReturnValue(true);
      fs.unlinkSync.mockImplementation(() => {}); // Mock successful deletion

      const response = await request(app).delete('/api/documents/doc-to-delete');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Document deleted successfully.');
      expect(prisma.document.findUnique).toHaveBeenCalledWith({ where: { id: 'doc-to-delete' } });
      expect(fs.existsSync).toHaveBeenCalledWith(mockDocument.storage_path);
      expect(fs.unlinkSync).toHaveBeenCalledWith(mockDocument.storage_path);
      expect(prisma.document.delete).toHaveBeenCalledWith({ where: { id: 'doc-to-delete' } });
    });
    
    it('should proceed with DB deletion if file does not exist on filesystem', async () => {
        const mockDocument = {
            id: 'doc-no-file',
            title: 'No File Here',
            storage_path: 'path/to/nonexistent/file.pdf',
            uploader_id: 1,
            owner_id: 1,
        };
        prisma.document.findUnique.mockResolvedValue(mockDocument);
        prisma.document.delete.mockResolvedValue(mockDocument);
        fs.existsSync.mockReturnValue(false); // File does not exist

        const response = await request(app).delete('/api/documents/doc-no-file');

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Document deleted successfully.');
        expect(fs.unlinkSync).not.toHaveBeenCalled();
        expect(prisma.document.delete).toHaveBeenCalledWith({ where: { id: 'doc-no-file' } });
    });


    it('should return 404 if document to delete not found', async () => {
      prisma.document.findUnique.mockResolvedValue(null); // Simulate document not found before deletion attempt

      const response = await request(app).delete('/api/documents/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Document not found.');
      expect(fs.unlinkSync).not.toHaveBeenCalled();
      expect(prisma.document.delete).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/documents/search (Search Documents)', () => {
    it('should return search results for a query', async () => {
      const mockSearchResults = [
        { id: 'search-1', title: 'Test Query Result', description: 'Contains test query' },
        { id: 'search-2', original_filename: 'test_query_file.pdf' },
      ];
      prisma.document.findMany.mockResolvedValue(mockSearchResults);

      const response = await request(app).get('/api/documents/search?q=test');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockSearchResults);
      expect(prisma.document.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { title: { contains: 'test', mode: 'insensitive' } },
            { description: { contains: 'test', mode: 'insensitive' } },
            { original_filename: { contains: 'test', mode: 'insensitive' } },
          ],
        },
      });
    });

    it('should return 400 if search query "q" is missing', async () => {
      const response = await request(app).get('/api/documents/search');
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Search query (q) is required.');
    });

    it('should return an empty list if search yields no results', async () => {
        prisma.document.findMany.mockResolvedValue([]);
        const response = await request(app).get('/api/documents/search?q=obscurequery');
        expect(response.status).toBe(200);
        expect(response.body).toEqual([]);
    });
  });
});

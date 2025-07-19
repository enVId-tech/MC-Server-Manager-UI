import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import verificationService from '@/lib/server/verify';
import { IUser } from '@/lib/objects/User';

// Create uploads directory if it doesn't exist
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

async function ensureUploadDir() {
  try {
    await fs.access(UPLOAD_DIR);
  } catch {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  }
}

/**
 * Clean up old temporary files (files older than 24 hours)
 */
async function cleanupOldTemporaryFiles(userEmail: string): Promise<void> {
  try {
    const userUploadDir = path.join(UPLOAD_DIR, userEmail);
    
    // Check if user directory exists
    try {
      await fs.access(userUploadDir);
    } catch {
      return; // Directory doesn't exist, nothing to cleanup
    }

    const files = await fs.readdir(userUploadDir, { withFileTypes: true });
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    let cleanedCount = 0;

    for (const file of files) {
      if (file.isFile()) {
        const filePath = path.join(userUploadDir, file.name);
        try {
          const stats = await fs.stat(filePath);
          const age = now - stats.mtime.getTime();
          
          if (age > maxAge) {
            await fs.unlink(filePath);
            cleanedCount++;
            console.log(`Cleaned up old temporary file: ${file.name}`);
          }
        } catch (error) {
          console.warn(`Failed to check/delete old file ${file.name}:`, error);
        }
      }
    }

    // Try to remove directory if it's empty
    try {
      const remainingFiles = await fs.readdir(userUploadDir);
      if (remainingFiles.length === 0) {
        await fs.rmdir(userUploadDir);
        console.log(`Removed empty user upload directory: ${userUploadDir}`);
      }
    } catch {
      // Ignore errors when trying to remove directory
    }

    if (cleanedCount > 0) {
      console.log(`Cleanup completed: removed ${cleanedCount} old temporary files for user ${userEmail}`);
    }
  } catch (error) {
    console.error('Error during old file cleanup:', error);
  }
}

export async function POST(request: NextRequest) {
  console.log('Upload route called - POST request received');
  try {
    // Verify user authentication
    const user: IUser | null = await verificationService.getUserFromToken(request);
    console.log('User verification result:', user ? `User: ${user.email}` : 'No user found');
    
    if (!user) {
      console.log('Upload failed: User not found');
      return NextResponse.json({ message: 'User not found.' }, { status: 404 });
    }

    await ensureUploadDir();
    console.log('Upload directory ensured');

    // Clean up old temporary files while we're here
    await cleanupOldTemporaryFiles(user.email);

    const formData = await request.formData();
    console.log('FormData parsed successfully');
    
    const file = formData.get('file') as File;
    const fileType = formData.get('fileType') as string; // 'plugin', 'mod', 'world', 'properties'
    const serverId = formData.get('serverId') as string;

    console.log('Upload parameters:', { 
      fileName: file?.name, 
      fileSize: file?.size, 
      fileType, 
      serverId 
    });

    if (!file || !fileType) {
      console.log('Upload failed: Missing file or fileType');
      return NextResponse.json({ error: 'File and fileType are required' }, { status: 400 });
    }

    // Generate unique filename
    const fileId = uuidv4();
    const fileName = file.name;
    const fileExtension = path.extname(fileName);
    const uniqueFileName = `${fileId}${fileExtension}`;
    
    // Create user-specific upload directory
    const userUploadDir = path.join(UPLOAD_DIR, user.email);
    try {
      await fs.access(userUploadDir);
    } catch {
      await fs.mkdir(userUploadDir, { recursive: true });
    }

    const filePath = path.join(userUploadDir, uniqueFileName);

    // Save file to disk
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await fs.writeFile(filePath, buffer);

    // Return file metadata
    const fileMetadata = {
      fileId,
      originalName: fileName,
      fileName: uniqueFileName,
      filePath: filePath,
      size: file.size,
      type: file.type,
      fileType: fileType,
      uploadedAt: new Date().toISOString(),
      serverId: serverId || null
    };

    console.log(`File uploaded: ${fileName} -> ${uniqueFileName} (${fileType})`);

    return NextResponse.json({
      success: true,
      file: fileMetadata
    });

  } catch (error) {
    console.error('File upload error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json(
      { error: 'Failed to upload file', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Verify user authentication
    const user: IUser | null = await verificationService.getUserFromToken(request);
    if (!user) {
      return NextResponse.json({ message: 'User not found.' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get('fileId');
    const fileName = searchParams.get('fileName');

    if (!fileId || !fileName) {
      return NextResponse.json({ error: 'File ID and file name are required' }, { status: 400 });
    }

    // Construct file path
    const userUploadDir = path.join(UPLOAD_DIR, user.email);
    const filePath = path.join(userUploadDir, fileName);

    // Delete file
    try {
      await fs.unlink(filePath);
      console.log(`File deleted: ${fileName}`);
      
      return NextResponse.json({
        success: true,
        message: 'File deleted successfully'
      });
    } catch (error) {
      console.error('File deletion error:', error);
      return NextResponse.json(
        { error: 'Failed to delete file', details: error instanceof Error ? error.message : 'File not found' },
        { status: 404 }
      );
    }

  } catch (error) {
    console.error('File deletion error:', error);
    return NextResponse.json(
      { error: 'Failed to delete file', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

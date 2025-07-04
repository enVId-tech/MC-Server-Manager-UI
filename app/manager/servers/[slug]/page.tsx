'use client';
import React, { useState, useEffect, use, useCallback } from 'react';
import {
  FaFolder,
  FaFile,
  FaPlay,
  FaPause,
  FaStop,
  FaDownload,
  FaTrash,
  FaArrowLeft,
  FaSave,
  FaEdit,
  FaMemory,
  FaUsers,
  FaCircle
} from 'react-icons/fa';
import { useRouter } from 'next/navigation';
import { useNotifications } from '@/lib/contexts/NotificationContext';
import styles from './server.module.scss';
import serverManager from '@/public/server-manager-bg.png';

interface FileItem {
  name: string;
  type: 'file' | 'folder';
  path: string;
  size?: number;
  lastModified?: Date;
}

interface ServerStats {
  isOnline: boolean;
  playersOnline: number;
  maxPlayers: number;
  ramUsage: number;
  maxRam: number;
  cpuUsage: number;
}

export default function Server({ params }: { params: Promise<{ slug: string }> }) {
  // Unwrap the params Promise using React.use()
  const resolvedParams = use(params);
  const router = useRouter();
  const { showNotification, showConfirmDialog } = useNotifications();

  const [currentPath, setCurrentPath] = useState('/');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [serverStats, setServerStats] = useState<ServerStats>({
    isOnline: true,
    playersOnline: 3,
    maxPlayers: 20,
    ramUsage: 2048,
    maxRam: 4096,
    cpuUsage: 45
  });

  // Fetch files from WebDAV
  const fetchFiles = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);

    try {
      // Temporarily use test endpoint to debug
      const response = await fetch(`/api/server/files/test?server=${encodeURIComponent(resolvedParams.slug)}&path=${encodeURIComponent(path)}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch files');
      }

      const data = await response.json();
      console.log('API Response:', data);
      setFiles(data.files || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch files');
      console.error('Error fetching files:', err);
    } finally {
      setLoading(false);
    }
  }, [resolvedParams.slug]);

  // Fetch file content from WebDAV
  const fetchFileContent = async (filePath: string) => {
    setFileLoading(true);

    try {
      const response = await fetch(`/api/server/file?server=${encodeURIComponent(resolvedParams.slug)}&file=${encodeURIComponent(filePath)}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch file content');
      }

      const data = await response.json();
      setFileContent(data.content || 'No content available');
    } catch (err) {
      setFileContent('Error loading file content: ' + (err instanceof Error ? err.message : 'Unknown error'));
      console.error('Error fetching file content:', err);
    } finally {
      setFileLoading(false);
    }
  };

  // Save file content to WebDAV
  const saveFileContent = async () => {
    if (!selectedFile) return;

    setIsSaving(true);
    showNotification({
      type: 'info',
      message: 'Saving file...'
    });

    try {
      const response = await fetch('/api/server/file', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          serverSlug: resolvedParams.slug,
          filePath: selectedFile.path,
          content: fileContent
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to save file');
      }

      setHasUnsavedChanges(false);
      setIsEditing(false);
      showNotification({
        type: 'success',
        title: 'File Saved',
        message: `${selectedFile.name} saved successfully!`
      });
    } catch (err) {
      showNotification({
        type: 'error',
        title: 'Save Error',
        message: 'Error saving file: ' + (err instanceof Error ? err.message : 'Unknown error')
      });
      console.error('Error saving file:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle back to dashboard
  const handleBackToDashboard = () => {
    if (hasUnsavedChanges) {
      showConfirmDialog({
        title: 'Unsaved Changes',
        message: 'You have unsaved changes that will be lost. Are you sure you want to leave?',
        confirmText: 'Leave anyway',
        cancelText: 'Stay',
        variant: 'danger',
        onConfirm: () => router.push('/manager/dashboard')
      });
    } else {
      router.push('/manager/dashboard');
    }
  };

  useEffect(() => {
    fetchFiles(currentPath);
  }, [currentPath, resolvedParams.slug, fetchFiles]);

  useEffect(() => {
    // Update server stats every 5 seconds
    const interval = setInterval(() => {
      setServerStats(prev => ({
        ...prev,
        ramUsage: Math.floor(Math.random() * 500) + 1800,
        cpuUsage: Math.floor(Math.random() * 30) + 30
      }));
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const checkAuth = () => {
      const res = fetch('/api/auth/check', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      res.then(response => {
        if (!response.ok) {
          router.push('/auth/login'); // Redirect to login if already logged in
        } else {
          setIsLoaded(true);
        }
      }).catch(error => {
        console.error('Error checking authentication:', error);
      });
    }

    const interval = setInterval(() => {
      checkAuth();
    }, 60 * 1000); // Check every minute

    // Initial check on component mount
    checkAuth();

    // Add event listener for cookies change
    window.addEventListener('cookies', checkAuth);

    return () => {
      window.removeEventListener('cookies', checkAuth);
      clearInterval(interval); // Clear the interval on component unmount
    };
  }, [router]);

  const handleFileClick = (file: FileItem) => {
    if (file.type === 'folder') {
      setCurrentPath(file.path);
      setSelectedFile(null);
      setFileContent('');
      setIsEditing(false);
    } else {
      setSelectedFile(file);
      setIsEditing(false);
      setHasUnsavedChanges(false);
      fetchFileContent(file.path);
    }
  };

  const handleBackClick = () => {
    const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
    setCurrentPath(parentPath);
  };

  const handleEditToggle = () => {
    setIsEditing(!isEditing);
    if (isEditing) {
      setHasUnsavedChanges(false);
    }
  };

  const handleContentChange = (value: string) => {
    setFileContent(value);
    setHasUnsavedChanges(true);
  };

  const handleSave = () => {
    saveFileContent();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getPathBreadcrumbs = () => {
    const parts = currentPath.split('/').filter(Boolean);
    const breadcrumbs = [{ name: 'root', path: '/' }];

    parts.forEach((part, index) => {
      const path = '/' + parts.slice(0, index + 1).join('/');
      breadcrumbs.push({ name: part, path });
    });

    return breadcrumbs;
  };

  return (
    <div className={styles.server} style={{ backgroundImage: `url(${serverManager.src})` }}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <button
              className={styles.backButton}
              onClick={handleBackToDashboard}
              title="Back to Dashboard"
            >
              <FaArrowLeft /> Back to Dashboard
            </button>
            {isLoaded && (
              <h1 className={styles.serverTitle}>Server: {resolvedParams.slug}</h1>
            )}
          </div>
        </div>

        <div className={styles.content}>
          {/* Left Panel - File Explorer */}
          <div className={styles.leftPanel}>
            <div className={styles.fileExplorer}>
              {isLoaded && (
                <div className={styles.explorerHeader}>
                  <h3>Server Files</h3>
                  <div className={styles.breadcrumbs}>
                    {getPathBreadcrumbs().map((crumb, index) => (
                      <span key={crumb.path}>
                        {index > 0 && <span className={styles.separator}>/</span>}
                        <button
                          className={styles.breadcrumbButton}
                          onClick={() => setCurrentPath(crumb.path)}
                        >
                          {crumb.name}
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className={styles.fileList}>
                {loading ? (
                  <div className={styles.loadingState}>
                    <p>Loading files...</p>
                  </div>
                ) : error ? (
                  <div className={styles.errorState}>
                    <p>Error: {error}</p>
                    <button onClick={() => fetchFiles(currentPath)}>Retry</button>
                  </div>
                ) : (
                  <>
                    {currentPath !== '/' && (
                      <div className={styles.fileItem} onClick={handleBackClick}>
                        <FaArrowLeft className={styles.fileIcon} />
                        <span className={styles.fileName}>Back</span>
                      </div>
                    )}

                    {files.map((file, index) => (
                      <div
                        key={index}
                        className={`${styles.fileItem} ${selectedFile?.path === file.path ? styles.selected : ''}`}
                        onClick={() => handleFileClick(file)}
                      >
                        {file.type === 'folder' ? (
                          <FaFolder className={styles.fileIcon} />
                        ) : (
                          <FaFile className={styles.fileIcon} />
                        )}
                        {isLoaded && (
                          <div className={styles.fileInfo}>
                            <span className={styles.fileName}>{file.name}</span>
                            {file.size && (
                              <span className={styles.fileSize}>{formatFileSize(file.size)}</span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right Panel */}
          <div className={styles.rightPanel}>
            {/* Top Right - Server Controls */}
            <div className={styles.serverControls}>
              {isLoaded && (
                <div className={styles.serverStatus}>
                  <div className={styles.statusIndicator}>
                    <FaCircle className={`${styles.statusIcon} ${serverStats.isOnline ? styles.online : styles.offline}`} />
                    <span className={styles.statusText}>
                      {serverStats.isOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>

                  <div className={styles.serverStats}>
                    <div className={styles.statItem}>
                      <FaUsers className={styles.statIcon} />
                      <span>{serverStats.playersOnline}/{serverStats.maxPlayers} players</span>
                    </div>
                    <div className={styles.statItem}>
                      <FaMemory className={styles.statIcon} />
                      <span>{serverStats.ramUsage}MB / {serverStats.maxRam}MB RAM</span>
                      <div className={styles.ramBar}>
                        <div
                          className={styles.ramFill}
                          style={{ width: `${(serverStats.ramUsage / serverStats.maxRam) * 100}%` }}
                        />
                      </div>
                    </div>
                    <div className={styles.statItem}>
                      <span>CPU: {serverStats.cpuUsage}%</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Server Control Buttons */}
              {isLoaded && (
                <div className={styles.controlButtons}>
                  <button className={`${styles.controlButton} ${styles.start}`}>
                    <FaPlay /> Start
                  </button>
                  <button className={`${styles.controlButton} ${styles.restart}`}>
                    <FaPause /> Restart
                  </button>
                  <button className={`${styles.controlButton} ${styles.stop}`}>
                    <FaStop /> Stop
                  </button>
                  <button className={`${styles.controlButton} ${styles.download}`}>
                    <FaDownload /> Download
                  </button>
                  <button className={`${styles.controlButton} ${styles.delete}`}>
                    <FaTrash /> Delete
                  </button>
                </div>
              )}
            </div>

            {/* Bottom Right - File Editor */}
            <div className={styles.fileEditor}>
              {selectedFile ? (
                <>
                  <div className={styles.editorHeader}>
                    <h4>{selectedFile.name}</h4>
                    <div className={styles.editorControls}>
                      {selectedFile && fileContent && fileContent !== 'Binary file - content not displayable' && (
                        <button
                          className={`${styles.editorButton} ${isEditing ? styles.active : ''}`}
                          onClick={handleEditToggle}
                        >
                          <FaEdit /> {isEditing ? 'View' : 'Edit'}
                        </button>
                      )}
                      {isEditing && hasUnsavedChanges && (
                        <button
                          className={`${styles.editorButton} ${styles.save}`}
                          onClick={handleSave}
                          disabled={isSaving}
                        >
                          <FaSave /> {isSaving ? 'Saving...' : 'Save'}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className={styles.editorContent}>
                    {fileLoading ? (
                      <div className={styles.loadingState}>
                        <p>Loading file content...</p>
                      </div>
                    ) : isEditing ? (
                      <textarea
                        className={styles.editor}
                        value={fileContent}
                        onChange={(e) => handleContentChange(e.target.value)}
                        placeholder="File content..."
                      />
                    ) : (
                      <pre className={styles.viewer}>{fileContent}</pre>
                    )}
                  </div>
                </>
              ) : (
                <div className={styles.editorPlaceholder}>
                  <FaFile className={styles.placeholderIcon} />
                  <p>Select a file to view or edit</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
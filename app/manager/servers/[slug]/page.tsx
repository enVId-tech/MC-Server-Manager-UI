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
  FaCircle,
  FaPlus,
  FaSearch
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
  isReadable?: boolean;
  isEditable?: boolean;
  mimeType?: string;
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
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createType, setCreateType] = useState<'file' | 'folder'>('file');
  const [newItemName, setNewItemName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'modified'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  // Utility function to format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Utility function to get file extension
  const getFileExtension = (filename: string): string => {
    return filename.substring(filename.lastIndexOf('.') + 1).toLowerCase();
  };

  // Utility function to get file icon based on type
  const getFileIcon = (file: FileItem) => {
    if (file.type === 'folder') return <FaFolder className={styles.fileIcon} />;
    
    const ext = getFileExtension(file.name);
    switch (ext) {
      case 'properties':
      case 'yml':
      case 'yaml':
      case 'json':
      case 'conf':
      case 'cfg':
        return <FaFile className={styles.fileIcon} style={{ color: '#4CAF50' }} />;
      case 'log':
        return <FaFile className={styles.fileIcon} style={{ color: '#FF9800' }} />;
      case 'jar':
        return <FaFile className={styles.fileIcon} style={{ color: '#2196F3' }} />;
      case 'txt':
      case 'md':
        return <FaFile className={styles.fileIcon} style={{ color: '#9C27B0' }} />;
      default:
        return <FaFile className={styles.fileIcon} />;
    }
  };

  // Filter and sort files
  const filteredAndSortedFiles = files
    .filter(file => file.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      // Always put folders first
      if (a.type === 'folder' && b.type === 'file') return -1;
      if (a.type === 'file' && b.type === 'folder') return 1;
      
      let comparison = 0;
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'size':
          comparison = (a.size || 0) - (b.size || 0);
          break;
        case 'modified':
          comparison = (a.lastModified?.getTime() || 0) - (b.lastModified?.getTime() || 0);
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
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
      const response = await fetch(`/api/server/files?server=${encodeURIComponent(resolvedParams.slug)}&path=${encodeURIComponent(path)}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to fetch files');
      }

      const data = await response.json();
      console.log('Files fetched:', data);
      setFiles(data.files || []);
      setIsLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch files');
      console.error('Error fetching files:', err);
      showNotification({
        type: 'error',
        title: 'Error',
        message: 'Failed to fetch server files: ' + (err instanceof Error ? err.message : 'Unknown error')
      });
    } finally {
      setLoading(false);
    }
  }, [resolvedParams.slug, showNotification]);

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

  // Create new file or folder
  const handleCreateItem = async () => {
    if (!newItemName.trim()) {
      showNotification({
        type: 'warning',
        message: 'Please enter a name for the new item'
      });
      return;
    }

    try {
      const response = await fetch('/api/server/file-manager', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          serverSlug: resolvedParams.slug,
          path: currentPath,
          name: newItemName.trim(),
          type: createType,
          content: createType === 'file' ? '' : undefined
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create item');
      }

      showNotification({
        type: 'success',
        title: 'Success',
        message: `${createType === 'file' ? 'File' : 'Folder'} created successfully`
      });

      setShowCreateModal(false);
      setNewItemName('');
      fetchFiles(currentPath);
    } catch (err) {
      showNotification({
        type: 'error',
        title: 'Error',
        message: 'Failed to create item: ' + (err instanceof Error ? err.message : 'Unknown error')
      });
    }
  };

  // Delete file or folder
  const handleDeleteItem = async (file: FileItem) => {
    showConfirmDialog({
      title: 'Delete Item',
      message: `Are you sure you want to delete "${file.name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const response = await fetch('/api/server/file-manager', {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              serverSlug: resolvedParams.slug,
              path: file.path,
              type: file.type
            })
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to delete item');
          }

          showNotification({
            type: 'success',
            title: 'Success',
            message: `${file.type === 'file' ? 'File' : 'Folder'} deleted successfully`
          });

          // Clear selection if the deleted item was selected
          if (selectedFile?.path === file.path) {
            setSelectedFile(null);
            setFileContent('');
            setIsEditing(false);
            setHasUnsavedChanges(false);
          }

          fetchFiles(currentPath);
        } catch (err) {
          showNotification({
            type: 'error',
            title: 'Error',
            message: 'Failed to delete item: ' + (err instanceof Error ? err.message : 'Unknown error')
          });
        }
      }
    });
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
                  <div className={styles.fileControls}>
                    <div className={styles.searchBar}>
                      <input
                        type="text"
                        placeholder="Search files..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={styles.searchInput}
                      />
                    </div>
                    <div className={styles.actionButtons}>
                      <button
                        className={styles.createButton}
                        onClick={() => {
                          setCreateType('file');
                          setShowCreateModal(true);
                        }}
                        title="Create New File"
                      >
                        <FaFile /> New File
                      </button>
                      <button
                        className={styles.createButton}
                        onClick={() => {
                          setCreateType('folder');
                          setShowCreateModal(true);
                        }}
                        title="Create New Folder"
                      >
                        <FaFolder /> New Folder
                      </button>
                    </div>
                  </div>
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
                    <FaCircle className={styles.loadingSpinner} />
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
                        <div className={styles.fileContent}>
                          <FaArrowLeft className={styles.fileIcon} />
                          <span className={styles.fileName}>Back</span>
                        </div>
                      </div>
                    )}

                    {filteredAndSortedFiles.length === 0 ? (
                      <div className={styles.emptyState}>
                        <FaFolder className={styles.emptyIcon} />
                        <p>No files found</p>
                        {searchTerm && (
                          <p className={styles.emptySubtext}>Try clearing your search</p>
                        )}
                      </div>
                    ) : (
                      filteredAndSortedFiles.map((file, index) => (
                        <div
                          key={index}
                          className={`${styles.fileItem} ${selectedFile?.path === file.path ? styles.selected : ''}`}
                        >
                          <div 
                            className={styles.fileContent}
                            onClick={() => handleFileClick(file)}
                          >
                            {getFileIcon(file)}
                            {isLoaded && (
                              <div className={styles.fileInfo}>
                                <span className={styles.fileName}>{file.name}</span>
                                {file.size !== undefined && file.size > 0 && (
                                  <span className={styles.fileSize}>{formatFileSize(file.size)}</span>
                                )}
                                {file.isEditable && (
                                  <span className={styles.fileTag}>Editable</span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className={styles.fileActions}>
                            <button
                              className={styles.deleteButton}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteItem(file);
                              }}
                              title="Delete"
                            >
                              <FaTrash />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
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
                        onChange={(e) => {
                          setFileContent(e.target.value);
                          setHasUnsavedChanges(true);
                        }}
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

        {/* Create Item Modal */}
        {showCreateModal && (
          <div className={styles.modalOverlay}>
            <div className={styles.modal}>
              <div className={styles.modalHeader}>
                <h3>Create New {createType === 'file' ? 'File' : 'Folder'}</h3>
                <button 
                  className={styles.modalClose}
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewItemName('');
                  }}
                >
                  ×
                </button>
              </div>
              <div className={styles.modalContent}>
                <input
                  type="text"
                  placeholder={`Enter ${createType} name...`}
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className={styles.modalInput}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleCreateItem();
                    }
                  }}
                  autoFocus
                />
              </div>
              <div className={styles.modalActions}>
                <button 
                  className={styles.modalButton}
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewItemName('');
                  }}
                >
                  Cancel
                </button>
                <button 
                  className={`${styles.modalButton} ${styles.primary}`}
                  onClick={handleCreateItem}
                  disabled={!newItemName.trim()}
                >
                  Create {createType === 'file' ? 'File' : 'Folder'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
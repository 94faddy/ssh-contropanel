'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import TerminalREST from '@/components/TerminalREST';
import { ArrowLeft } from 'lucide-react';
import Swal from 'sweetalert2';
import type { Server, ApiResponse } from '@/types';

export default function TerminalPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [server, setServer] = useState<Server | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTerminal, setShowTerminal] = useState(false);

  useEffect(() => {
    const serverId = searchParams.get('server');
    if (serverId) {
      const id = parseInt(serverId);
      if (!isNaN(id)) {
        fetchServer(id);
      } else {
        setError('Invalid server ID');
        setLoading(false);
      }
    } else {
      setError('No server selected');
      setLoading(false);
    }
  }, [searchParams]);

  const fetchServer = async (serverId: number) => {
    setLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        setError('Authentication token not found');
        router.push('/login');
        return;
      }

      const response = await fetch(`/api/servers/${serverId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        if (response.status === 404) {
          setError('Server not found');
        } else if (response.status === 403) {
          setError('Access denied to this server');
        } else {
          setError('Failed to load server');
        }
        return;
      }

      const data: ApiResponse<Server> = await response.json();
      if (data.success && data.data) {
        setServer(data.data);
        setShowTerminal(true);
      } else {
        setError(data.error || 'Failed to load server');
      }
    } catch (error) {
      console.error('Failed to fetch server:', error);
      setError('Failed to load server: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    router.push('/dashboard/servers');
  };

  if (loading) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center h-96">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading terminal...</p>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-8">
          <button
            onClick={handleBack}
            className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-6"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Servers
          </button>

          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 className="text-lg font-medium text-red-800 mb-2">Unable to Load Terminal</h2>
            <p className="text-red-700 mb-4">{error}</p>
            <div className="space-x-3">
              <button
                onClick={handleBack}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                Go to Servers
              </button>
              <button
                onClick={() => {
                  if (server) {
                    fetchServer(server.id);
                  } else {
                    const serverId = searchParams.get('server');
                    if (serverId) {
                      fetchServer(parseInt(serverId));
                    }
                  }
                }}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!server) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-8">
          <button
            onClick={handleBack}
            className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-6"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Servers
          </button>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <h2 className="text-lg font-medium text-yellow-800 mb-2">No Server Selected</h2>
            <p className="text-yellow-700 mb-4">
              Please select a server from the servers list to open the terminal.
            </p>
            <button
              onClick={handleBack}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-yellow-600 hover:bg-yellow-700"
            >
              Go to Servers
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="h-screen flex flex-col bg-gray-50">
        {/* Header */}
        <div className="bg-white shadow-sm px-4 sm:px-6 lg:px-8 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <button
                onClick={handleBack}
                className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-2"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Servers
              </button>
              <h1 className="text-2xl font-bold text-gray-900">Terminal - {server.name}</h1>
              <p className="mt-1 text-sm text-gray-500">
                {server.host}:{server.port} • {server.status === 'CONNECTED' ? '🟢 Connected' : '🔴 Disconnected'}
              </p>
            </div>
          </div>
        </div>

        {/* Terminal Container */}
        <div className="flex-1 overflow-hidden">
          {showTerminal && (
            <TerminalREST
              serverId={server.id}
              serverName={server.name}
              onClose={handleBack}
            />
          )}
        </div>
      </div>
    </Layout>
  );
}
'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Layout from '@/components/Layout';
import TerminalREST from '@/components/TerminalREST';
import type { Server } from '@/types';

export default function TerminalPage() {
  const searchParams = useSearchParams();
  const [server, setServer] = useState<Server | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTerminal, setShowTerminal] = useState(false);

  useEffect(() => {
    const serverId = searchParams.get('server');
    if (serverId) {
      fetchServer(parseInt(serverId));
    }
  }, [searchParams]);

  const fetchServer = async (serverId: number) => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/servers/${serverId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setServer(data.data);
          setShowTerminal(true);
        }
      }
    } catch (error) {
      console.error('Failed to fetch server:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </Layout>
    );
  }

  if (!server) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <h2 className="text-lg font-medium text-yellow-800 mb-2">Server Not Found</h2>
            <p className="text-yellow-700">
              Please select a server from the servers page to start using the terminal.
            </p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Terminal - {server.name}</h1>
          <p className="mt-1 text-sm text-gray-500">{server.host}:{server.port}</p>
        </div>

        {showTerminal && (
          <TerminalREST
            serverId={server.id}
            serverName={server.name}
            onClose={() => setShowTerminal(false)}
          />
        )}
      </div>
    </Layout>
  );
}
export interface XeroConnection {
	tenantId: string;
	tenantName: string;
	tenantType: string;
	connectionId: string;
	lastSeenAt: string;
}

export interface SessionState {
	principalId: string | null;
	connections: XeroConnection[];
	activeTenantId: string | null;
	encryptedAccessToken: string | null;
	encryptedRefreshToken: string | null;
	tokenExpiresAt: number | null;
	oauthState: string | null;
	oauthStateCreatedAt: number | null;
	lastActivityAt: number | null;
}

export const DEFAULT_SESSION_STATE: SessionState = {
	principalId: null,
	connections: [],
	activeTenantId: null,
	encryptedAccessToken: null,
	encryptedRefreshToken: null,
	tokenExpiresAt: null,
	oauthState: null,
	oauthStateCreatedAt: null,
	lastActivityAt: null,
};

export type OAuthStatePayload =
	| {
		kind: "mcp_init";
		pendingAuthId: string;
		nonce: string;
	}
	| {
		kind: "add_org";
		principalId: string;
		nonce: string;
	};

export interface XeroTokenResponse {
	access_token: string;
	refresh_token: string;
	id_token?: string;
	expires_in: number;
	token_type: string;
	scope?: string;
}

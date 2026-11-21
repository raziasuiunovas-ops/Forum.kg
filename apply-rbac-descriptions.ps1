# Apply RBAC descriptions to all admin endpoints in OpenAPI
$yamlPath = "docs/openapi.yaml"
$yaml = Get-Content $yamlPath -Raw

# Define RBAC mappings based on API_CONTRACTS_DECISIONS.md Section 7.2
$rbacMappings = @{
    # Users - SUPER_ADMIN only
    "summary: List forum categories\s+tags: \[Admin\]\s+operationId: adminListForumCategories" = 
        "summary: List forum categories`n      description: |`n        **Required Role:** MANAGER or SUPER_ADMIN`n      tags: [Admin]`n      operationId: adminListForumCategories"
    
    "summary: Create category\s+tags: \[Admin\]\s+operationId: adminCreateCategory" =
        "summary: Create category`n      description: |`n        **Required Role:** MANAGER or SUPER_ADMIN`n      tags: [Admin]`n      operationId: adminCreateCategory"
    
    "summary: Get forum analytics\s+tags: \[Admin\]\s+operationId: adminGetForumAnalytics" =
        "summary: Get forum analytics`n      description: |`n        **Required Role:** MANAGER or SUPER_ADMIN`n      tags: [Admin]`n      operationId: adminGetForumAnalytics"
    
    "summary: Update category\s+tags: \[Admin\]\s+operationId: adminUpdateCategory" =
        "summary: Update category`n      description: |`n        **Required Role:** MANAGER or SUPER_ADMIN`n      tags: [Admin]`n      operationId: adminUpdateCategory"
    
    "summary: Delete category\s+tags: \[Admin\]\s+operationId: adminDeleteCategory" =
        "summary: Delete category`n      description: |`n        **Required Role:** MANAGER or SUPER_ADMIN`n      tags: [Admin]`n      operationId: adminDeleteCategory"
    
    # Orders - MANAGER+
    "summary: List all orders\s+tags: \[Admin\]\s+operationId: adminListOrders" =
        "summary: List all orders`n      description: |`n        **Required Role:** MANAGER or SUPER_ADMIN`n      tags: [Admin]`n      operationId: adminListOrders"
    
    "summary: Get order details\s+tags: \[Admin\]\s+operationId: adminGetOrder" =
        "summary: Get order details`n      description: |`n        **Required Role:** MANAGER or SUPER_ADMIN`n      tags: [Admin]`n      operationId: adminGetOrder"
    
    # Tickets - MANAGER+
    "summary: List all tickets\s+tags: \[Admin\]\s+operationId: adminListTickets" =
        "summary: List all tickets`n      description: |`n        **Required Role:** MANAGER or SUPER_ADMIN`n      tags: [Admin]`n      operationId: adminListTickets"
    
    "summary: Cancel ticket \(admin\)\s+tags: \[Admin\]\s+operationId: adminCancelTicket" =
        "summary: Cancel ticket (admin)`n      description: |`n        **Required Role:** MANAGER or SUPER_ADMIN`n      tags: [Admin]`n      operationId: adminCancelTicket"
    
    # Check-ins - SCANNER+
    "summary: List all check-ins\s+tags: \[Admin\]\s+operationId: adminListCheckIns" =
        "summary: List all check-ins`n      description: |`n        **Required Role:** SCANNER, MANAGER, or SUPER_ADMIN`n      tags: [Admin]`n      operationId: adminListCheckIns"
    
    "summary: Export check-ins \(CSV\)\s+tags: \[Admin\]\s+operationId: adminExportCheckIns" =
        "summary: Export check-ins (CSV)`n      description: |`n        **Required Role:** SCANNER, MANAGER, or SUPER_ADMIN`n      tags: [Admin]`n      operationId: adminExportCheckIns"
    
    # Cancellations - MANAGER+
    "summary: List all cancellation requests\s+tags: \[Admin\]\s+operationId: adminListCancellations" =
        "summary: List all cancellation requests`n      description: |`n        **Required Role:** MANAGER or SUPER_ADMIN`n      tags: [Admin]`n      operationId: adminListCancellations"
    
    "summary: Approve cancellation\s+tags: \[Admin\]\s+operationId: adminApproveCancellation" =
        "summary: Approve cancellation`n      description: |`n        **Required Role:** MANAGER or SUPER_ADMIN`n      tags: [Admin]`n      operationId: adminApproveCancellation"
    
    "summary: Reject cancellation\s+tags: \[Admin\]\s+operationId: adminRejectCancellation" =
        "summary: Reject cancellation`n      description: |`n        **Required Role:** MANAGER or SUPER_ADMIN`n      tags: [Admin]`n      operationId: adminRejectCancellation"
    
    # Settings - SUPER_ADMIN only
    "summary: Update site settings\s+tags: \[Admin\]\s+operationId: adminUpdateSettings" =
        "summary: Update site settings`n      description: |`n        **Required Role:** SUPER_ADMIN`n      tags: [Admin]`n      operationId: adminUpdateSettings"
    
    "summary: Update settings translations\s+tags: \[Admin\]\s+operationId: adminUpdateSettingsTranslations" =
        "summary: Update settings translations`n      description: |`n        **Required Role:** SUPER_ADMIN`n      tags: [Admin]`n      operationId: adminUpdateSettingsTranslations"
    
    "summary: Add social link\s+tags: \[Admin\]\s+operationId: adminAddSocialLink" =
        "summary: Add social link`n      description: |`n        **Required Role:** SUPER_ADMIN`n      tags: [Admin]`n      operationId: adminAddSocialLink"
    
    "summary: Delete social link\s+tags: \[Admin\]\s+operationId: adminDeleteSocialLink" =
        "summary: Delete social link`n      description: |`n        **Required Role:** SUPER_ADMIN`n      tags: [Admin]`n      operationId: adminDeleteSocialLink"
    
    # Reports - MANAGER+
    "summary: Revenue report\s+tags: \[Admin\]\s+operationId: adminGetRevenueReport" =
        "summary: Revenue report`n      description: |`n        **Required Role:** MANAGER or SUPER_ADMIN`n      tags: [Admin]`n      operationId: adminGetRevenueReport"
    
    "summary: Sales report\s+tags: \[Admin\]\s+operationId: adminGetSalesReport" =
        "summary: Sales report`n      description: |`n        **Required Role:** MANAGER or SUPER_ADMIN`n      tags: [Admin]`n      operationId: adminGetSalesReport"
    
    "summary: User statistics\s+tags: \[Admin\]\s+operationId: adminGetUserReport" =
        "summary: User statistics`n      description: |`n        **Required Role:** MANAGER or SUPER_ADMIN`n      tags: [Admin]`n      operationId: adminGetUserReport"
    
    "summary: Forum statistics\s+tags: \[Admin\]\s+operationId: adminGetForumReport" =
        "summary: Forum statistics`n      description: |`n        **Required Role:** MANAGER or SUPER_ADMIN`n      tags: [Admin]`n      operationId: adminGetForumReport"
    
    "summary: Export custom report\s+tags: \[Admin\]\s+operationId: adminExportReport" =
        "summary: Export custom report`n      description: |`n        **Required Role:** MANAGER or SUPER_ADMIN`n      tags: [Admin]`n      operationId: adminExportReport"
    
    # Audit logs - SUPER_ADMIN only
    "summary: List audit logs\s+tags: \[Admin\]\s+operationId: adminListAuditLogs" =
        "summary: List audit logs`n      description: |`n        **Required Role:** SUPER_ADMIN`n      tags: [Admin]`n      operationId: adminListAuditLogs"
    
    "summary: Export audit logs\s+tags: \[Admin\]\s+operationId: adminExportAuditLogs" =
        "summary: Export audit logs`n      description: |`n        **Required Role:** SUPER_ADMIN`n      tags: [Admin]`n      operationId: adminExportAuditLogs"
}

# Apply replacements
foreach ($pattern in $rbacMappings.Keys) {
    if ($yaml -match $pattern) {
        $yaml = $yaml -replace $pattern, $rbacMappings[$pattern]
        Write-Output "✓ Applied RBAC to: $($rbacMappings[$pattern] -split '\n')[0]"
    }
}

# Save updated file
$yaml | Set-Content $yamlPath -Encoding UTF8 -NoNewline
Write-Output ""
Write-Output "✅ RBAC descriptions applied to docs/openapi.yaml"
